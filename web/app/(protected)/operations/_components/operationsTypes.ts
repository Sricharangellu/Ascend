export interface StockItem {
  product_id: string;
  product_name: string;
  sku: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
}

export interface InventoryLocation {
  id: string;
  code: string;
  name: string;
  location_type: string;
  outlet_id: string | null;
  is_sellable: boolean;
  is_receiving_location: boolean;
  is_active: boolean;
}

export interface LocationStock {
  id: string;
  product_id: string;
  quantity_on_hand: number;
  quantity_committed: number;
  quantity_available: number;
  average_cost_cents: number;
  reorder_level: number;
  updated_at: number;
}

export interface TransferForm {
  fromLocationId: string;
  toLocationId: string;
  productQuery: string;
  quantity: number;
}
