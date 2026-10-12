-- =============================================================================
-- Categories: three levels, atomic moves and reorders (v1.2, owner spec 4).
--
-- WRITTEN, NOT APPLIED. Unverified against a live database.
--
-- 1. Helpers: category_depth, category_subtree_height, category_chain_contains.
-- 2. categories_guard_tree(): BEFORE INSERT / UPDATE OF parent_id trigger. It
--    rejects a self parent, a cycle, a missing parent and a branch deeper than
--    three levels, so no write path can bypass the rule.
-- 3. move_category(): one transaction. Locks the table, checks updated_at
--    against the value the admin read (stale edit), re-validates, renumbers the
--    old and new siblings (only rows whose sort_order changes are written) and
--    sets parent_id. Service role only.
-- 4. reorder_category(): the same, for a move inside the current parent.
--
-- Sibling order is sort_order, then hebrew_name, then id, all COLLATE "C"
-- (code-unit order, as in src/lib/category-tree.ts).
--
-- Error codes (SQLSTATE, read by src/actions/categories.ts):
--   CAT01 stale (updated_at differs from p_expected_updated_at)
--   CAT02 category not found
--   CAT03 a category cannot be its own parent
--   CAT04 cycle (the new parent is inside the moved branch)
--   CAT05 the deepest category of the moved branch would be level 4 or deeper
--   CAT06 parent not found
--
-- Without this migration the app keeps working: creating and renaming still
-- work (validated in TS), and reorder falls back to a non-atomic update. Moves
-- between parents return "requires migration 023" (undefined_function 42883 or
-- PGRST202 from PostgREST).
--
-- Idempotent: CREATE OR REPLACE, DROP TRIGGER IF EXISTS, repeated GRANT/REVOKE.
-- =============================================================================

-- Number of ancestors of a category: 0 for top level, NULL when the id does not exist.
CREATE OR REPLACE FUNCTION public.category_depth(p_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH RECURSIVE up(id, parent_id, lvl) AS (
    SELECT c.id, c.parent_id, 0 FROM public.categories c WHERE c.id = p_id
    UNION
    SELECT c.id, c.parent_id, up.lvl + 1 FROM public.categories c JOIN up ON c.id = up.parent_id
  )
  SELECT max(lvl) FROM up;
$$;

-- Levels below a category: 0 for a leaf (or an unknown id), 1 when its children are leaves, and so on.
CREATE OR REPLACE FUNCTION public.category_subtree_height(p_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH RECURSIVE down(id, lvl) AS (
    SELECT c.id, 0 FROM public.categories c WHERE c.id = p_id
    UNION
    SELECT c.id, down.lvl + 1 FROM public.categories c JOIN down ON c.parent_id = down.id
  )
  SELECT coalesce(max(lvl), 0) FROM down;
$$;

-- True when p_target is p_start or one of its ancestors. A move of X under P is a cycle when X is in P's chain.
CREATE OR REPLACE FUNCTION public.category_chain_contains(p_start uuid, p_target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH RECURSIVE up(id, parent_id) AS (
    SELECT c.id, c.parent_id FROM public.categories c WHERE c.id = p_start
    UNION
    SELECT c.id, c.parent_id FROM public.categories c JOIN up ON c.id = up.parent_id
  )
  SELECT EXISTS (SELECT 1 FROM up WHERE up.id = p_target);
$$;

-- Guard for every insert and every parent change. Same rules as validateCategoryMove().
CREATE OR REPLACE FUNCTION public.categories_guard_tree()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_parent_depth integer;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'a category cannot be its own parent' USING ERRCODE = 'CAT03';
  END IF;
  IF public.category_chain_contains(NEW.parent_id, NEW.id) THEN
    RAISE EXCEPTION 'a category cannot move under its own subcategory' USING ERRCODE = 'CAT04';
  END IF;

  v_parent_depth := public.category_depth(NEW.parent_id);
  IF v_parent_depth IS NULL THEN
    RAISE EXCEPTION 'parent category not found' USING ERRCODE = 'CAT06';
  END IF;
  IF v_parent_depth + 1 + public.category_subtree_height(NEW.id) >= 3 THEN
    RAISE EXCEPTION 'categories allow three levels at most' USING ERRCODE = 'CAT05';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_guard_tree ON public.categories;
CREATE TRIGGER categories_guard_tree
  BEFORE INSERT OR UPDATE OF parent_id ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.categories_guard_tree();

-- Moves p_id under p_new_parent (NULL = top level) at 0-based position p_new_index
-- (clamped), then renumbers both sibling lists 0..n-1.
CREATE OR REPLACE FUNCTION public.move_category(
  p_id uuid,
  p_new_parent uuid,
  p_new_index integer,
  p_expected_updated_at timestamptz
)
RETURNS public.categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.categories;
  v_old_parent uuid;
  v_new_depth integer;
  v_ids uuid[];
  v_count integer;
  v_target integer;
  v_i integer;
BEGIN
  -- One tree write at a time: two moves cannot each validate against the other's old state.
  LOCK TABLE public.categories IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO v_row FROM public.categories WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'category not found' USING ERRCODE = 'CAT02';
  END IF;
  IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'category changed by someone else' USING ERRCODE = 'CAT01';
  END IF;
  v_old_parent := v_row.parent_id;

  IF p_new_parent IS NULL THEN
    v_new_depth := 0;
  ELSE
    IF p_new_parent = p_id THEN
      RAISE EXCEPTION 'a category cannot be its own parent' USING ERRCODE = 'CAT03';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE id = p_new_parent) THEN
      RAISE EXCEPTION 'parent category not found' USING ERRCODE = 'CAT06';
    END IF;
    IF public.category_chain_contains(p_new_parent, p_id) THEN
      RAISE EXCEPTION 'a category cannot move under its own subcategory' USING ERRCODE = 'CAT04';
    END IF;
    v_new_depth := public.category_depth(p_new_parent) + 1;
  END IF;
  IF v_new_depth + public.category_subtree_height(p_id) >= 3 THEN
    RAISE EXCEPTION 'categories allow three levels at most' USING ERRCODE = 'CAT05';
  END IF;

  -- Old siblings, without the moved category, in their current order.
  IF v_old_parent IS DISTINCT FROM p_new_parent THEN
    SELECT coalesce(array_agg(c.id ORDER BY c.sort_order, c.hebrew_name COLLATE "C", c.id::text COLLATE "C"), '{}')
    INTO v_ids
    FROM public.categories c
    WHERE c.parent_id IS NOT DISTINCT FROM v_old_parent AND c.id <> p_id;

    v_count := coalesce(array_length(v_ids, 1), 0);
    FOR v_i IN 1..v_count LOOP
      UPDATE public.categories
      SET sort_order = v_i - 1
      WHERE id = v_ids[v_i] AND sort_order IS DISTINCT FROM (v_i - 1);
    END LOOP;
  END IF;

  -- New siblings in their current order, with the moved category inserted at p_new_index.
  SELECT coalesce(array_agg(c.id ORDER BY c.sort_order, c.hebrew_name COLLATE "C", c.id::text COLLATE "C"), '{}')
  INTO v_ids
  FROM public.categories c
  WHERE c.parent_id IS NOT DISTINCT FROM p_new_parent AND c.id <> p_id;

  v_count := coalesce(array_length(v_ids, 1), 0);
  v_target := greatest(0, least(coalesce(p_new_index, 0), v_count));
  v_ids := v_ids[1:v_target] || p_id || v_ids[v_target + 1:v_count];

  FOR v_i IN 1..(v_count + 1) LOOP
    IF v_ids[v_i] = p_id THEN
      UPDATE public.categories
      SET parent_id = p_new_parent, sort_order = v_i - 1, updated_at = now()
      WHERE id = p_id;
    ELSE
      UPDATE public.categories
      SET sort_order = v_i - 1
      WHERE id = v_ids[v_i] AND sort_order IS DISTINCT FROM (v_i - 1);
    END IF;
  END LOOP;

  SELECT * INTO v_row FROM public.categories WHERE id = p_id;
  RETURN v_row;
END;
$$;

-- Moves p_id inside its current parent to p_new_index (0-based, clamped).
CREATE OR REPLACE FUNCTION public.reorder_category(
  p_id uuid,
  p_new_index integer,
  p_expected_updated_at timestamptz
)
RETURNS public.categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_parent uuid;
BEGIN
  -- Lock before reading the parent, so a concurrent move cannot change it under us.
  LOCK TABLE public.categories IN SHARE ROW EXCLUSIVE MODE;

  SELECT c.parent_id INTO v_parent FROM public.categories c WHERE c.id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'category not found' USING ERRCODE = 'CAT02';
  END IF;

  RETURN public.move_category(p_id, v_parent, p_new_index, p_expected_updated_at);
END;
$$;

-- Writes go through the service-role client after requireAdmin(). Nothing else may call them.
REVOKE ALL ON FUNCTION public.move_category(uuid, uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_category(uuid, uuid, integer, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.reorder_category(uuid, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_category(uuid, integer, timestamptz) TO service_role;
