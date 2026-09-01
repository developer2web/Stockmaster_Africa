import { create } from 'zustand';

type ProductListViewState={
  searches:Record<string,string>;
  setSearch:(scope:string,value:string)=>void;
};

export const useProductListView=create<ProductListViewState>(set=>({
  searches:{},
  setSearch:(scope,value)=>set(state=>({searches:{...state.searches,[scope]:value}})),
}));
