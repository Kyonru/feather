export type CellDataGetterParams = {
  columnData?: any;
  dataKey: string;
  rowData: any;
};

export type CellRendererParams = {
  cellData?: any;
  columnData?: any;
  dataKey: string;
  rowData: any;
  rowIndex: number;
};

export type HeaderRowRendererParams = {
  className: string;
  columns: any[]; // You can replace `any` with a more specific column type
  style: React.CSSProperties;
};

export type HeaderRendererParams = {
  columnData?: any;
  dataKey: string;
  disableSort?: boolean;
  label?: any;
  sortBy?: string;
  sortDirection?: "ASC" | "DESC" | undefined;
};

export type RowRendererParams = {
  className: string;
  columns: any[]; // Again, consider using a specific type here
  index: number;
  isScrolling: boolean;
  onRowClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onRowRightClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onRowDoubleClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onRowMouseOver?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onRowMouseOut?: (event: React.MouseEvent<HTMLDivElement>) => void;
  rowData: any;
  style: React.CSSProperties;
  key: string;
};
