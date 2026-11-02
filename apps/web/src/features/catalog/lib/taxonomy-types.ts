/**
 * Row shapes the taxonomy islands render. They mirror the panel contract outputs
 * but live here so a client island never imports a server module (which would
 * pull `src/server/**` into the browser bundle).
 */
export type DepartmentRow = {
  id: string;
  name: string;
  active: boolean;
  itemsCount: number;
  updatedAt: string;
};

export type CategoryRow = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  itemsCount: number;
  updatedAt: string;
  departmentIds: string[];
  departmentNames: string[];
};

export type SubcategoryRow = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  active: boolean;
  sortOrder: number;
  itemsCount: number;
  updatedAt: string;
};

export type TagRow = {
  id: string;
  name: string;
  isActive: boolean;
  itemsCount: number;
};

export type BadgeRow = {
  id: string;
  name: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  itemsCount: number;
};
