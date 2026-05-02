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
      action_logs: {
        Row: {
          action_type: string
          created_at: string
          description: string
          entity_id: string | null
          entity_type: string
          id: string
          is_undone: boolean | null
          metadata: Json | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          description: string
          entity_id?: string | null
          entity_type: string
          id?: string
          is_undone?: boolean | null
          metadata?: Json | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          is_undone?: boolean | null
          metadata?: Json | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      allowed_ips: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          ip_address: string
          is_active: boolean | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address: string
          is_active?: boolean | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      batches: {
        Row: {
          batch_number: string
          batch_status: string | null
          coating: string | null
          coil_number: string | null
          colour: string | null
          created_at: string
          form: string | null
          from_intransit: boolean
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
          from_intransit?: boolean
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
          from_intransit?: boolean
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
      cash_entries: {
        Row: {
          amount: number
          buyer_name: string | null
          category: string | null
          comments: string | null
          created_at: string
          debtor_name: string | null
          direction: string
          entry_date: string
          id: string
          received_date: string | null
          source_id: string | null
          source_type: string | null
          status: string
          sub_category: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          buyer_name?: string | null
          category?: string | null
          comments?: string | null
          created_at?: string
          debtor_name?: string | null
          direction: string
          entry_date?: string
          id?: string
          received_date?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          sub_category?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_name?: string | null
          category?: string | null
          comments?: string | null
          created_at?: string
          debtor_name?: string | null
          direction?: string
          entry_date?: string
          id?: string
          received_date?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          sub_category?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          credit_terms: string | null
          customer_address: string | null
          customer_name: string
          customer_type: string
          gst_number: string | null
          id: string
          reference: string | null
        }
        Insert: {
          created_at?: string
          credit_terms?: string | null
          customer_address?: string | null
          customer_name: string
          customer_type?: string
          gst_number?: string | null
          id?: string
          reference?: string | null
        }
        Update: {
          created_at?: string
          credit_terms?: string | null
          customer_address?: string | null
          customer_name?: string
          customer_type?: string
          gst_number?: string | null
          id?: string
          reference?: string | null
        }
        Relationships: []
      }
      debtor_master: {
        Row: {
          address: string | null
          company_name: string
          contact: string | null
          created_at: string
          credit_period_days: number | null
          gstin: string | null
          id: string
          is_active: boolean
          is_intracompany: boolean
          ledger_name: string
          sales_rep: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_name: string
          contact?: string | null
          created_at?: string
          credit_period_days?: number | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          is_intracompany?: boolean
          ledger_name: string
          sales_rep?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_name?: string
          contact?: string | null
          created_at?: string
          credit_period_days?: number | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          is_intracompany?: boolean
          ledger_name?: string
          sales_rep?: string | null
          updated_at?: string
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
      dropdown_options: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          parent_value: string | null
          sort_order: number | null
          value: string
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          parent_value?: string | null
          sort_order?: number | null
          value: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          parent_value?: string | null
          sort_order?: number | null
          value?: string
        }
        Relationships: []
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
          sku_id: string | null
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
          sku_id?: string | null
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
          sku_id?: string | null
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
          {
            foreignKeyName: "fg_items_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
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
      invoice_credit_periods: {
        Row: {
          company_name: string
          credit_period_days: number
          id: string
          updated_at: string
          voucher_number: string
        }
        Insert: {
          company_name: string
          credit_period_days: number
          id?: string
          updated_at?: string
          voucher_number: string
        }
        Update: {
          company_name?: string
          credit_period_days?: number
          id?: string
          updated_at?: string
          voucher_number?: string
        }
        Relationships: []
      }
      invoice_details: {
        Row: {
          created_at: string
          credit_period: number | null
          dispatch_type: string | null
          id: string
          invoice_amount: number | null
          invoice_number: string
          purchase_invoice_number: string | null
          source_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_period?: number | null
          dispatch_type?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_number: string
          purchase_invoice_number?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_period?: number | null
          dispatch_type?: string | null
          id?: string
          invoice_amount?: number | null
          invoice_number?: string
          purchase_invoice_number?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inward_payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          id: string
          payment_date: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id: string
          id?: string
          payment_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          id?: string
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "inward_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_dispatches: {
        Row: {
          created_at: string
          dispatch_date: string | null
          dispatch_qty: number | null
          id: string
          invoice_number: string | null
          order_item_id: string
        }
        Insert: {
          created_at?: string
          dispatch_date?: string | null
          dispatch_qty?: number | null
          id?: string
          invoice_number?: string | null
          order_item_id: string
        }
        Update: {
          created_at?: string
          dispatch_date?: string | null
          dispatch_qty?: number | null
          id?: string
          invoice_number?: string | null
          order_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_dispatches_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          coating: string | null
          comments: string | null
          created_at: string
          form: string | null
          grade: string | null
          id: string
          length: number | null
          material: string | null
          net_weight: number | null
          order_id: string
          sku_id: string | null
          thickness: number | null
          width: number | null
        }
        Insert: {
          coating?: string | null
          comments?: string | null
          created_at?: string
          form?: string | null
          grade?: string | null
          id?: string
          length?: number | null
          material?: string | null
          net_weight?: number | null
          order_id: string
          sku_id?: string | null
          thickness?: number | null
          width?: number | null
        }
        Update: {
          coating?: string | null
          comments?: string | null
          created_at?: string
          form?: string | null
          grade?: string | null
          id?: string
          length?: number | null
          material?: string | null
          net_weight?: number | null
          order_id?: string
          sku_id?: string | null
          thickness?: number | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          comments: string | null
          created_at: string
          customer_id: string
          id: string
          order_date: string | null
          order_number: string
          po_number: string | null
          status: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          customer_id: string
          id?: string
          order_date?: string | null
          order_number: string
          po_number?: string | null
          status?: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          order_date?: string | null
          order_number?: string
          po_number?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      pallet_consumptions: {
        Row: {
          consumption_date: string
          created_at: string
          id: string
          invoice_number: string | null
          num_pcs: number
          order_id: string | null
          pallet_sku_id: string
          processing_record_id: string | null
          weight_kg: number
        }
        Insert: {
          consumption_date: string
          created_at?: string
          id?: string
          invoice_number?: string | null
          num_pcs?: number
          order_id?: string | null
          pallet_sku_id: string
          processing_record_id?: string | null
          weight_kg?: number
        }
        Update: {
          consumption_date?: string
          created_at?: string
          id?: string
          invoice_number?: string | null
          num_pcs?: number
          order_id?: string | null
          pallet_sku_id?: string
          processing_record_id?: string | null
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
          {
            foreignKeyName: "pallet_consumptions_processing_record_id_fkey"
            columns: ["processing_record_id"]
            isOneToOne: false
            referencedRelation: "processing_records"
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
      pending_approvals: {
        Row: {
          action_type: string
          created_at: string
          description: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          requested_by: string
          requested_by_email: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          action_type: string
          created_at?: string
          description: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          requested_by: string
          requested_by_email?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          requested_by?: string
          requested_by_email?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
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
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      sales_reps: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      scrap_sales: {
        Row: {
          amount_received: number | null
          buyer_name: string | null
          created_at: string
          id: string
          invoice_number: string | null
          material: string | null
          qty_sold: number | null
          sales_date: string | null
          sales_type: string | null
          scrap_type: string
          weight_slip_url: string | null
        }
        Insert: {
          amount_received?: number | null
          buyer_name?: string | null
          created_at?: string
          id?: string
          invoice_number?: string | null
          material?: string | null
          qty_sold?: number | null
          sales_date?: string | null
          sales_type?: string | null
          scrap_type: string
          weight_slip_url?: string | null
        }
        Update: {
          amount_received?: number | null
          buyer_name?: string | null
          created_at?: string
          id?: string
          invoice_number?: string | null
          material?: string | null
          qty_sold?: number | null
          sales_date?: string | null
          sales_type?: string | null
          scrap_type?: string
          weight_slip_url?: string | null
        }
        Relationships: []
      }
      skus: {
        Row: {
          coating: string | null
          created_at: string
          grade: string | null
          id: string
          length: number | null
          material: string | null
          thickness: number | null
          width: number | null
        }
        Insert: {
          coating?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          length?: number | null
          material?: string | null
          thickness?: number | null
          width?: number | null
        }
        Update: {
          coating?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          length?: number | null
          material?: string | null
          thickness?: number | null
          width?: number | null
        }
        Relationships: []
      }
      steel_pallet_consumptions: {
        Row: {
          consumption_date: string
          created_at: string
          id: string
          num_pcs: number
          order_id: string | null
          pallet_sku_id: string
          processing_record_id: string | null
          weight_kg: number
        }
        Insert: {
          consumption_date: string
          created_at?: string
          id?: string
          num_pcs?: number
          order_id?: string | null
          pallet_sku_id: string
          processing_record_id?: string | null
          weight_kg?: number
        }
        Update: {
          consumption_date?: string
          created_at?: string
          id?: string
          num_pcs?: number
          order_id?: string | null
          pallet_sku_id?: string
          processing_record_id?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "steel_pallet_consumptions_pallet_sku_id_fkey"
            columns: ["pallet_sku_id"]
            isOneToOne: false
            referencedRelation: "steel_pallet_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      steel_pallet_purchases: {
        Row: {
          created_at: string
          id: string
          num_pcs: number
          pallet_sku_id: string
          purchase_date: string
          rate_per_kg: number | null
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          num_pcs?: number
          pallet_sku_id: string
          purchase_date: string
          rate_per_kg?: number | null
          weight_kg?: number
        }
        Update: {
          created_at?: string
          id?: string
          num_pcs?: number
          pallet_sku_id?: string
          purchase_date?: string
          rate_per_kg?: number | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "steel_pallet_purchases_pallet_sku_id_fkey"
            columns: ["pallet_sku_id"]
            isOneToOne: false
            referencedRelation: "steel_pallet_skus"
            referencedColumns: ["id"]
          },
        ]
      }
      steel_pallet_skus: {
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
      tally_companies: {
        Row: {
          company_name: string
          created_at: string
          id: string
          is_active: boolean
          tally_url: string
        }
        Insert: {
          company_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          tally_url?: string
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          tally_url?: string
        }
        Relationships: []
      }
      tally_groups: {
        Row: {
          company_name: string
          group_name: string
          id: string
          parent_group: string | null
          synced_at: string
          ultimate_parent: string | null
        }
        Insert: {
          company_name: string
          group_name: string
          id?: string
          parent_group?: string | null
          synced_at?: string
          ultimate_parent?: string | null
        }
        Update: {
          company_name?: string
          group_name?: string
          id?: string
          parent_group?: string | null
          synced_at?: string
          ultimate_parent?: string | null
        }
        Relationships: []
      }
      tally_ledger_balances: {
        Row: {
          as_of_date: string
          closing_balance: number | null
          company_name: string
          id: string
          ledger_group: string | null
          ledger_name: string
          synced_at: string
          ultimate_group: string | null
        }
        Insert: {
          as_of_date: string
          closing_balance?: number | null
          company_name: string
          id?: string
          ledger_group?: string | null
          ledger_name: string
          synced_at?: string
          ultimate_group?: string | null
        }
        Update: {
          as_of_date?: string
          closing_balance?: number | null
          company_name?: string
          id?: string
          ledger_group?: string | null
          ledger_name?: string
          synced_at?: string
          ultimate_group?: string | null
        }
        Relationships: []
      }
      tally_stock_items: {
        Row: {
          as_of_date: string
          closing_qty: number | null
          closing_value: number | null
          company_name: string
          id: string
          item_name: string
          synced_at: string
          unit: string | null
        }
        Insert: {
          as_of_date: string
          closing_qty?: number | null
          closing_value?: number | null
          company_name: string
          id?: string
          item_name: string
          synced_at?: string
          unit?: string | null
        }
        Update: {
          as_of_date?: string
          closing_qty?: number | null
          closing_value?: number | null
          company_name?: string
          id?: string
          item_name?: string
          synced_at?: string
          unit?: string | null
        }
        Relationships: []
      }
      tally_sync_control: {
        Row: {
          is_paused: boolean
          sync_type: string
          updated_at: string
        }
        Insert: {
          is_paused?: boolean
          sync_type: string
          updated_at?: string
        }
        Update: {
          is_paused?: boolean
          sync_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      tally_sync_log: {
        Row: {
          chunk_label: string | null
          company_name: string | null
          completed_at: string | null
          error_message: string | null
          id: string
          last_successful_chunk: string | null
          records_fetched: number | null
          started_at: string
          status: string
          sync_type: string | null
        }
        Insert: {
          chunk_label?: string | null
          company_name?: string | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          last_successful_chunk?: string | null
          records_fetched?: number | null
          started_at?: string
          status?: string
          sync_type?: string | null
        }
        Update: {
          chunk_label?: string | null
          company_name?: string | null
          completed_at?: string | null
          error_message?: string | null
          id?: string
          last_successful_chunk?: string | null
          records_fetched?: number | null
          started_at?: string
          status?: string
          sync_type?: string | null
        }
        Relationships: []
      }
      tally_vouchers: {
        Row: {
          amount: number | null
          company_name: string
          date: string | null
          id: string
          line_items: Json | null
          narration: string | null
          party_name: string | null
          sync_type: string | null
          synced_at: string
          voucher_number: string
          voucher_type: string | null
        }
        Insert: {
          amount?: number | null
          company_name: string
          date?: string | null
          id?: string
          line_items?: Json | null
          narration?: string | null
          party_name?: string | null
          sync_type?: string | null
          synced_at?: string
          voucher_number: string
          voucher_type?: string | null
        }
        Update: {
          amount?: number | null
          company_name?: string
          date?: string | null
          id?: string
          line_items?: Json | null
          narration?: string | null
          party_name?: string | null
          sync_type?: string | null
          synced_at?: string
          voucher_number?: string
          voucher_type?: string | null
        }
        Relationships: []
      }
      transporter_freight: {
        Row: {
          comments: string | null
          created_at: string
          gst: number | null
          id: string
          invoice_number: string
          lr_number: string | null
          status: string
          tds: number | null
          total_freight: number | null
          transporter_id: string | null
          updated_at: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          gst?: number | null
          id?: string
          invoice_number: string
          lr_number?: string | null
          status?: string
          tds?: number | null
          total_freight?: number | null
          transporter_id?: string | null
          updated_at?: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          gst?: number | null
          id?: string
          invoice_number?: string
          lr_number?: string | null
          status?: string
          tds?: number | null
          total_freight?: number | null
          transporter_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transporter_freight_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
        ]
      }
      transporter_freight_comments: {
        Row: {
          comment: string
          created_at: string
          id: string
          transporter_freight_id: string
          user_email: string
        }
        Insert: {
          comment: string
          created_at?: string
          id?: string
          transporter_freight_id: string
          user_email: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: string
          transporter_freight_id?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "transporter_freight_comments_transporter_freight_id_fkey"
            columns: ["transporter_freight_id"]
            isOneToOne: false
            referencedRelation: "transporter_freight"
            referencedColumns: ["id"]
          },
        ]
      }
      transporter_freight_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_date: string
          transporter_freight_id: string
          user_email: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          payment_date?: string
          transporter_freight_id: string
          user_email: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_date?: string
          transporter_freight_id?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "transporter_freight_payments_transporter_freight_id_fkey"
            columns: ["transporter_freight_id"]
            isOneToOne: false
            referencedRelation: "transporter_freight"
            referencedColumns: ["id"]
          },
        ]
      }
      transporters: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      truck_trip_expenses: {
        Row: {
          cng_amount: number | null
          created_at: string
          driver_expense: number | null
          expense_date: string
          id: string
          other_expense: number | null
          other_expense_desc: string | null
          source_kind: string
          source_ref: string | null
          toll_parking: number | null
          total_amount: number | null
          truck_expense: number | null
          truck_expense_desc: string | null
          truck_number: string
          truck_trip_id: string | null
        }
        Insert: {
          cng_amount?: number | null
          created_at?: string
          driver_expense?: number | null
          expense_date?: string
          id?: string
          other_expense?: number | null
          other_expense_desc?: string | null
          source_kind?: string
          source_ref?: string | null
          toll_parking?: number | null
          total_amount?: number | null
          truck_expense?: number | null
          truck_expense_desc?: string | null
          truck_number: string
          truck_trip_id?: string | null
        }
        Update: {
          cng_amount?: number | null
          created_at?: string
          driver_expense?: number | null
          expense_date?: string
          id?: string
          other_expense?: number | null
          other_expense_desc?: string | null
          source_kind?: string
          source_ref?: string | null
          toll_parking?: number | null
          total_amount?: number | null
          truck_expense?: number | null
          truck_expense_desc?: string | null
          truck_number?: string
          truck_trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "truck_trip_expenses_truck_trip_id_fkey"
            columns: ["truck_trip_id"]
            isOneToOne: false
            referencedRelation: "truck_trips"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_trips: {
        Row: {
          created_at: string
          document_number: string | null
          id: string
          quantity: number | null
          source_destination: string | null
          trip_date: string
          trip_id: string
          trip_type: string
          truck_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_number?: string | null
          id?: string
          quantity?: number | null
          source_destination?: string | null
          trip_date: string
          trip_id: string
          trip_type: string
          truck_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_number?: string | null
          id?: string
          quantity?: number | null
          source_destination?: string | null
          trip_date?: string
          trip_id?: string
          trip_type?: string
          truck_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          browser: string | null
          created_at: string | null
          device_fingerprint: string
          device_name: string | null
          id: string
          ip_address: string | null
          is_approved: boolean | null
          last_seen_at: string | null
          os: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          device_fingerprint: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          is_approved?: boolean | null
          last_seen_at?: string | null
          os?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          is_approved?: boolean | null
          last_seen_at?: string | null
          os?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_edit: boolean | null
          can_view: boolean | null
          id: string
          page: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean | null
          can_view?: boolean | null
          id?: string
          page: string
          user_id: string
        }
        Update: {
          can_edit?: boolean | null
          can_view?: boolean | null
          id?: string
          page?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wip_defectives: {
        Row: {
          created_at: string
          defect_type: string
          id: string
          quantity: number | null
          wip_item_id: string
        }
        Insert: {
          created_at?: string
          defect_type: string
          id?: string
          quantity?: number | null
          wip_item_id: string
        }
        Update: {
          created_at?: string
          defect_type?: string
          id?: string
          quantity?: number | null
          wip_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wip_defectives_wip_item_id_fkey"
            columns: ["wip_item_id"]
            isOneToOne: false
            referencedRelation: "wip_items"
            referencedColumns: ["id"]
          },
        ]
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
      admin_exists: { Args: never; Returns: boolean }
      cascade_dropdown_rename: {
        Args: { p_category: string; p_new_value: string; p_old_value: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      setup_first_admin: { Args: { admin_user_id: string }; Returns: undefined }
      upsert_sku: {
        Args: {
          p_coating: string
          p_grade: string
          p_length: number
          p_material: string
          p_thickness: number
          p_width: number
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
