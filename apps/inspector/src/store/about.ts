import { create } from 'zustand';

type AboutStoreState = {
  open: boolean;
};

type AboutStoreActions = {
  setOpen: (open: boolean) => void;
};

type AboutStore = AboutStoreState & AboutStoreActions;

const defaultAbout: AboutStoreState = {
  open: false,
};

export const useAboutStore = create<AboutStore>((set) => ({
  ...defaultAbout,
  setOpen: (open: boolean) => set({ open }),
}));
