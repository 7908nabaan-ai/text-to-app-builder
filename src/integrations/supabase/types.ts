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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          address: string | null
          company_name: string
          contact_email: string | null
          currency: string
          id: boolean
          payment_instructions: string | null
          updated_at: string
          viber_number: string | null
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          company_name?: string
          contact_email?: string | null
          currency?: string
          id?: boolean
          payment_instructions?: string | null
          updated_at?: string
          viber_number?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string
          contact_email?: string | null
          currency?: string
          id?: boolean
          payment_instructions?: string | null
          updated_at?: string
          viber_number?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      container_types: {
        Row: {
          capacity_cbm: number
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          capacity_cbm: number
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          capacity_cbm?: number
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          cbm_per_carton: number
          id: string
          invoice_id: string
          price: number
          product_name: string
          quantity: number
          sku: string
          subtotal: number
          total_cbm: number
          unit: string | null
        }
        Insert: {
          cbm_per_carton: number
          id?: string
          invoice_id: string
          price: number
          product_name: string
          quantity: number
          sku: string
          subtotal: number
          total_cbm: number
          unit?: string | null
        }
        Update: {
          cbm_per_carton?: number
          id?: string
          invoice_id?: string
          price?: number
          product_name?: string
          quantity?: number
          sku?: string
          subtotal?: number
          total_cbm?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          advance_amount: number
          advance_percent: number | null
          container_capacity_cbm: number | null
          container_code: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          id: string
          invoice_number: string
          issue_date: string
          kind: Database["public"]["Enums"]["invoice_kind"]
          order_id: string
          payment_instructions: string | null
          state: Database["public"]["Enums"]["invoice_state"]
          total_cbm: number
          total_value: number
          version: number
        }
        Insert: {
          advance_amount?: number
          advance_percent?: number | null
          container_capacity_cbm?: number | null
          container_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          id?: string
          invoice_number: string
          issue_date?: string
          kind: Database["public"]["Enums"]["invoice_kind"]
          order_id: string
          payment_instructions?: string | null
          state?: Database["public"]["Enums"]["invoice_state"]
          total_cbm?: number
          total_value?: number
          version?: number
        }
        Update: {
          advance_amount?: number
          advance_percent?: number | null
          container_capacity_cbm?: number | null
          container_code?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          kind?: Database["public"]["Enums"]["invoice_kind"]
          order_id?: string
          payment_instructions?: string | null
          state?: Database["public"]["Enums"]["invoice_state"]
          total_cbm?: number
          total_value?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          order_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          order_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          order_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          created_at: string
          event_type: string
          id: string
          new_price: number | null
          new_quantity: number | null
          new_status: string | null
          order_id: string
          previous_price: number | null
          previous_quantity: number | null
          previous_status: string | null
          product_name: string | null
          reason: string | null
          sku: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          event_type: string
          id?: string
          new_price?: number | null
          new_quantity?: number | null
          new_status?: string | null
          order_id: string
          previous_price?: number | null
          previous_quantity?: number | null
          previous_status?: string | null
          product_name?: string | null
          reason?: string | null
          sku?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          event_type?: string
          id?: string
          new_price?: number | null
          new_quantity?: number | null
          new_status?: string | null
          order_id?: string
          previous_price?: number | null
          previous_quantity?: number | null
          previous_status?: string | null
          product_name?: string | null
          reason?: string | null
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          catalog_price: number
          category_name: string | null
          cbm_per_carton: number
          created_at: string
          current_quantity: number
          final_quantity: number | null
          id: string
          image_path: string | null
          negotiated_price: number
          order_id: string
          product_id: string | null
          product_name: string
          proposed_quantity: number | null
          requested_quantity: number
          sku: string
          unit: string
          updated_at: string
        }
        Insert: {
          catalog_price: number
          category_name?: string | null
          cbm_per_carton: number
          created_at?: string
          current_quantity?: number
          final_quantity?: number | null
          id?: string
          image_path?: string | null
          negotiated_price: number
          order_id: string
          product_id?: string | null
          product_name: string
          proposed_quantity?: number | null
          requested_quantity?: number
          sku: string
          unit?: string
          updated_at?: string
        }
        Update: {
          catalog_price?: number
          category_name?: string | null
          cbm_per_carton?: number
          created_at?: string
          current_quantity?: number
          final_quantity?: number | null
          id?: string
          image_path?: string | null
          negotiated_price?: number
          order_id?: string
          product_id?: string | null
          product_name?: string
          proposed_quantity?: number | null
          requested_quantity?: number
          sku?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          advance_amount: number | null
          advance_percent: number | null
          container_capacity_cbm: number
          container_type_id: string
          created_at: string
          customer_id: string
          finalized_at: string | null
          id: string
          is_locked: boolean
          notes: string | null
          order_number: string
          shipped_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          advance_amount?: number | null
          advance_percent?: number | null
          container_capacity_cbm: number
          container_type_id: string
          created_at?: string
          customer_id: string
          finalized_at?: string | null
          id?: string
          is_locked?: boolean
          notes?: string | null
          order_number?: string
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          advance_amount?: number | null
          advance_percent?: number | null
          container_capacity_cbm?: number
          container_type_id?: string
          created_at?: string
          customer_id?: string
          finalized_at?: string | null
          id?: string
          is_locked?: boolean
          notes?: string | null
          order_number?: string
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_container_type_id_fkey"
            columns: ["container_type_id"]
            isOneToOne: false
            referencedRelation: "container_types"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          id: string
          method: string | null
          notes: string | null
          order_id: string
          paid_at: string
          recorded_by: string | null
          reference: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          id?: string
          method?: string | null
          notes?: string | null
          order_id: string
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          id?: string
          method?: string | null
          notes?: string | null
          order_id?: string
          paid_at?: string
          recorded_by?: string | null
          reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          carton_height: number | null
          carton_length: number | null
          carton_width: number | null
          category_id: string | null
          cbm_per_carton: number
          created_at: string
          default_price: number
          description: string | null
          id: string
          image_path: string | null
          is_active: boolean
          name: string
          sku: string
          unit: string
          updated_at: string
        }
        Insert: {
          carton_height?: number | null
          carton_length?: number | null
          carton_width?: number | null
          category_id?: string | null
          cbm_per_carton: number
          created_at?: string
          default_price: number
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          sku: string
          unit?: string
          updated_at?: string
        }
        Update: {
          carton_height?: number | null
          carton_length?: number | null
          carton_width?: number | null
          category_id?: string | null
          cbm_per_carton?: number
          created_at?: string
          default_price?: number
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          name?: string
          sku?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_details: string | null
          company_name: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          notes: string | null
          phone: string | null
          shipping_address: string | null
          shipping_country: string | null
          shipping_destination: string | null
          updated_at: string
        }
        Insert: {
          company_details?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id: string
          notes?: string | null
          phone?: string | null
          shipping_address?: string | null
          shipping_country?: string | null
          shipping_destination?: string | null
          updated_at?: string
        }
        Update: {
          company_details?: string | null
          company_name?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          shipping_address?: string | null
          shipping_country?: string | null
          shipping_destination?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "staff" | "customer"
      invoice_kind: "proforma" | "commercial"
      invoice_state: "current" | "superseded" | "cancelled"
      order_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "awaiting_customer"
        | "customer_updated"
        | "confirmed"
        | "loading"
        | "shipped"
        | "completed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["staff", "customer"],
      invoice_kind: ["proforma", "commercial"],
      invoice_state: ["current", "superseded", "cancelled"],
      order_status: [
        "draft",
        "submitted",
        "under_review",
        "awaiting_customer",
        "customer_updated",
        "confirmed",
        "loading",
        "shipped",
        "completed",
      ],
    },
  },
} as const
