export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      batches: {
        Row: {
          batch_number: string
          batch_status: string | null
          coating: string | null
          coil_number: string | null
          colour: string | null
          created_at: string
          form: string | null
          grade: string | null
          gross_weight: number | null
          gsm: number | null
          id: string
          length: string | null
          make: string | null
          material: string | null
          net_weight: number | null
          purchase_date: string | null
          purchase_from: string | null
          status: string
          thickness: number | null
          updated_at: string
          width: number | null
        }
        Insert: {
          batch_number: string
          batch_status?: string | null
          coating?: string | null
          coil_number?: string | null
          colour?: string | null
          created_at?: string
          form?: string | null
          grade?: string | null
          gross_weight?: number | null
          gsm?: number | null
          id?: string
          length?: string | null
          make?: string | null
          material?: string | null
          net_weight?: number | null
          purchase_date?: string | null
          purchase_from?: string | null
          status?: string
          thickness?: number | null
          updated_at?: string
          width?: number | null
        }
        Update: {
          batch_number?: string
          batch_status?: string | null
          coating?: string | null
          coil_number?: string | null
          colour?: string | null
          created_at?: string
          form?: string | null
          grade?: string | null
          gross_weight?: number | null
          gsm?: number | null
          id?: string
          length?: string | null
          make?: string | null
          material?: string | null
          net_weight?: number | null
          purchase_date?: string | null
          purchase_from?: string | null
          status?: string
          thickness?: number | null
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      defective_sales: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          invoice_number: string | null
          order_id: string | null
          quantity: number | null
          sales_date: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          invoice_number?: string | null
          order_id?: string | null
          quantity?: number | null
          sales_date?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          invoice_number?: string | null
          order_id?: string | null
          quantity?: number | null
          sales_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "defective_sales_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      fg_defectives: {
        Row: {
          created_at: string
          defect_type: string
          fg_item_id: string
          id: string
          quantity: number | null
        }
        Insert: {
          created_at?: string
          defect_type: string
          fg_item_id: string
          id?: string
          quantity?: number | null
        }
        Update: {
          created_at?: string
          defect_type?: string
          fg_item_id?: string
          id?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fg_defectives_fg_item_id_fkey"
            columns: ["fg_item_id"]
            isOneToOne: false
            referencedRelation: "fg_items"
            referencedColumns: ["id"]
          },
        ]
      }
      fg_items: {
        Row: {
          coating: string | null
          created_at: string
          grade: string | null
          id: string
          length: number | null
          make: string | null
          material: string | null
          num_pcs: number | null
          order_id: string | null
          process: string | null
          processing_record_id: string | null
          qty: number | null
          source_id: string | null
          source_type: string | null
          thickness: number | null
          width: number | null
        }
        Insert: {
          coating?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          length?: number | null
          make?: string | null
          material?: string | null
          num_pcs?: number | null
          order_id?: string | null
          process?: string | null
          processing_record_id?: string | null
          qty?: number | null
          source_id?: string | null
          source_type?: string | null
          thickness?: number | null
          width?: number | null
        }
        Update: {
          coating?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          length?: number | null
          make?: string | null
          material?: string | null
          num_pcs?: number | null
          order_id?: string | null
          process?: string | null
          processing_record_id?: string | null
          qty?: number | null
          source_id?: string | null
          source_type?: string | null
          thickness?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fg_items_processing_record_id_fkey"
            columns: ["processing_record_id"]
            isOneToOne: false
            referencedRelation: "processing_records"
            referencedColumns: ["id"]
          },
        ]
      }
      fg_sales: {
        Row: {
          created_at: string
          fg_item_id: string
          id: string
          invoice_number: string | null
          order_id: string | null
          quantity: number | null
          sales_date: string | null
        }
        Insert: {
          created_at?: string
          fg_item_id: string
          id?: string
          invoice_number?: string | null
          order_id?: string | null
          quantity?: number | null
          sales_date?: string | null
        }
        Update: {
          created_at?: string
          fg_item_id?: string
          id?: string
          invoice_number?: string | null
          order_id?: string | null
          quantity?: number | null
          sales_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fg_sales_fg_item_id_fkey"
            columns: ["fg_item_id"]
            isOneToOne: false
            referencedRelation: "fg_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_actions: {
        Row: {
          action_type: string
          batch_id: string
          created_at: string
          defect_type: string | null
          gross_weight: number | null
          id: string
          invoice_number: string | null
          net_weight: number | null
          order_id: string | null
          sales_date: string | null
          scrap_type: string | null
        }
        Insert: {
          action_type: string
          batch_id: string
          created_at?: string
          defect_type?: string | null
          gross_weight?: number | null
          id?: string
          invoice_number?: string | null
          net_weight?: number | null
          order_id?: string | null
          sales_date?: string | null
          scrap_type?: string | null
        }
        Update: {
          action_type?: string
          batch_id?: string
          created_at?: string
          defect_type?: string | null
          gross_weight?: number | null
          id?: string
          invoice_number?: string | null
          net_weight?: number | null
          order_id?: string | null
          sales_date?: string | null
          scrap_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_actions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      pallet_consumptions: {
        Row: {
          consumption_date: string
          created_at: string
          id: string
          num_pcs: number
          order_id: string | null
          pallet_sku_id: string
          weight_kg: number
        }
        Insert: {
          consumption_date: string
          created_at?: string
          id?: string
          num_pcs?: number
          order_id?: string | null
          pallet_sku_id: string
          weight_kg?: number
        }
        Update: {
          consumption_date?: string
          created_at?: string
          id?: string
          num_pcs?: number
          order_id?: string | null
          pallet_sku_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "pallet_consumptions_pallet_sku_id_fkey"
            columns: ["pallet_sku_id"]
            isOneToOne: false
            referencedRelation: "pallet_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      pallet_purchases: {
        Row: {
          created_at: string
          id: string
          num_pcs: number
          pallet_sku_id: string
          purchase_date: string
          rate_per_kg: number | null
          supplier: string | null
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          num_pcs?: number
          pallet_sku_id: string
          purchase_date: string
          rate_per_kg?: number | null
          supplier?: string | null
          weight_kg?: number
        }
        Update: {
          created_at?: string
          id?: string
          num_pcs?: number
          pallet_sku_id?: string
          purchase_date?: string
          rate_per_kg?: number | null
          supplier?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "pallet_purchases_pallet_sku_id_fkey"
            columns: ["pallet_sku_id"]
            isOneToOne: false
            referencedRelation: "pallet_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      pallet_skus: {
        Row: {
          created_at: string
          id: string
          pallet_size: string
        }
        Insert: {
          created_at?: string
          id?: string
          pallet_size: string
        }
        Update: {
          created_at?: string
          id?: string
          pallet_size?: string
        }
        Relationships: []
      }
      processing_output_items: {
        Row: {
          created_at: string
          id: string
          length: number | null
          num_pcs: number | null
          processing_record_id: string
          qty_kg: number | null
          width: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          length?: number | null
          num_pcs?: number | null
          processing_record_id: string
          qty_kg?: number | null
          width?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          length?: number | null
          num_pcs?: number | null
          processing_record_id?: string
          qty_kg?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_output_items_processing_record_id_fkey"
            columns: ["processing_record_id"]
            isOneToOne: false
            referencedRelation: "processing_records"
            referencedColumns: ["id"]
          },
        ]
      }
      processing_records: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          input_qty: number | null
          order_id: string | null
          output_type: string
          process_type: string
          source_type: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          input_qty?: number | null
          order_id?: string | null
          output_type: string
          process_type: string
          source_type?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          input_qty?: number | null
          order_id?: string | null
          output_type?: string
          process_type?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "processing_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      scrap_sales: {
        Row: {
          amount_received: number | null
          created_at: string
          id: string
          material: string | null
          qty_sold: number | null
          sales_date: string | null
          scrap_type: string
          weight_slip_url: string | null
        }
        Insert: {
          amount_received?: number | null
          created_at?: string
          id?: string
          material?: string | null
          qty_sold?: number | null
          sales_date?: string | null
          scrap_type: string
          weight_slip_url?: string | null
        }
        Update: {
          amount_received?: number | null
          created_at?: string
          id?: string
          material?: string | null
          qty_sold?: number | null
          sales_date?: string | null
          scrap_type?: string
          weight_slip_url?: string | null
        }
        Relationships: []
      }
      wip_items: {
        Row: {
          coating: string | null
          created_at: string
          grade: string | null
          id: string
          length: number | null
          make: string | null
          material: string | null
          num_pcs: number | null
          order_id: string | null
          process: string | null
          processing_record_id: string | null
          qty: number | null
          source_batch_id: string | null
          status: string | null
          thickness: number | null
          width: number | null
        }
        Insert: {
          coating?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          length?: number | null
          make?: string | null
          material?: string | null
          num_pcs?: number | null
          order_id?: string | null
          process?: string | null
          processing_record_id?: string | null
          qty?: number | null
          source_batch_id?: string | null
          status?: string | null
          thickness?: number | null
          width?: number | null
        }
        Update: {
          coating?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          length?: number | null
          make?: string | null
          material?: string | null
          num_pcs?: number | null
          order_id?: string | null
          process?: string | null
          processing_record_id?: string | null
          qty?: number | null
          source_batch_id?: string | null
          status?: string | null
          thickness?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wip_items_processing_record_id_fkey"
            columns: ["processing_record_id"]
            isOneToOne: false
            referencedRelation: "processing_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wip_items_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
