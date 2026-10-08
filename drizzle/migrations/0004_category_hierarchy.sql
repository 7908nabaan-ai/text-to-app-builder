ALTER TABLE public.categories ADD COLUMN parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
CREATE INDEX categories_parent_id_idx ON public.categories(parent_id);
COMMENT ON COLUMN public.categories.parent_id IS 'Parent category; NULL = main category (Food / Non-Food), set = department under a main category';