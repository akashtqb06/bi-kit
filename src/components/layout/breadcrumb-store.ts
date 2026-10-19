import { create } from "zustand";

interface BreadcrumbCrumb {
  label: string;
  href?: string;
}

interface BreadcrumbStore {
  crumbs: BreadcrumbCrumb[] | null;
  setCrumbs: (crumbs: BreadcrumbCrumb[] | null) => void;
}

export const useBreadcrumbStore = create<BreadcrumbStore>((set) => ({
  crumbs: null,
  setCrumbs: (crumbs) => set({ crumbs }),
}));

