
CREATE OR REPLACE FUNCTION public.cascade_dropdown_rename(
  p_category text,
  p_old_value text,
  p_new_value text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_category = 'material' THEN
    UPDATE batches SET material = p_new_value WHERE material = p_old_value;
    UPDATE wip_items SET material = p_new_value WHERE material = p_old_value;
    UPDATE fg_items SET material = p_new_value WHERE material = p_old_value;
    UPDATE order_items SET material = p_new_value WHERE material = p_old_value;
    UPDATE skus SET material = p_new_value WHERE material = p_old_value;
    UPDATE scrap_sales SET material = p_new_value WHERE material = p_old_value;
  ELSIF p_category = 'make' THEN
    UPDATE batches SET make = p_new_value WHERE make = p_old_value;
    UPDATE wip_items SET make = p_new_value WHERE make = p_old_value;
    UPDATE fg_items SET make = p_new_value WHERE make = p_old_value;
  ELSIF p_category = 'grade' THEN
    UPDATE batches SET grade = p_new_value WHERE grade = p_old_value;
    UPDATE wip_items SET grade = p_new_value WHERE grade = p_old_value;
    UPDATE fg_items SET grade = p_new_value WHERE grade = p_old_value;
    UPDATE order_items SET grade = p_new_value WHERE grade = p_old_value;
    UPDATE skus SET grade = p_new_value WHERE grade = p_old_value;
  ELSIF p_category = 'coating' THEN
    UPDATE batches SET coating = p_new_value WHERE coating = p_old_value;
    UPDATE wip_items SET coating = p_new_value WHERE coating = p_old_value;
    UPDATE fg_items SET coating = p_new_value WHERE coating = p_old_value;
    UPDATE order_items SET coating = p_new_value WHERE coating = p_old_value;
    UPDATE skus SET coating = p_new_value WHERE coating = p_old_value;
  ELSIF p_category = 'form' THEN
    UPDATE batches SET form = p_new_value WHERE form = p_old_value;
    UPDATE order_items SET form = p_new_value WHERE form = p_old_value;
  END IF;

  -- Also update parent_value references in dropdown_options for coating/grade
  IF p_category = 'material' THEN
    UPDATE dropdown_options SET parent_value = p_new_value WHERE parent_value = p_old_value;
  END IF;
END;
$$;
