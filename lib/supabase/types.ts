// GENERATED — NO EDITAR — npm run gen:types
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
      comprobante: {
        Row: {
          created_at: string
          credit_days: number | null
          deleted_at: string | null
          due_date: string | null
          entity_id: string
          id: string
          igv: number
          issue_date: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          registration_date: string
          status: Database["public"]["Enums"]["comprobante_status"]
          subtotal: number
          total: number
          updated_at: string
          voucher_kind: Database["public"]["Enums"]["voucher_kind"]
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Insert: {
          created_at?: string
          credit_days?: number | null
          deleted_at?: string | null
          due_date?: string | null
          entity_id: string
          id?: string
          igv: number
          issue_date: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          registration_date?: string
          status?: Database["public"]["Enums"]["comprobante_status"]
          subtotal: number
          total: number
          updated_at?: string
          voucher_kind: Database["public"]["Enums"]["voucher_kind"]
          voucher_number: string
          voucher_type: Database["public"]["Enums"]["voucher_type"]
        }
        Update: {
          created_at?: string
          credit_days?: number | null
          deleted_at?: string | null
          due_date?: string | null
          entity_id?: string
          id?: string
          igv?: number
          issue_date?: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          registration_date?: string
          status?: Database["public"]["Enums"]["comprobante_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          voucher_kind?: Database["public"]["Enums"]["voucher_kind"]
          voucher_number?: string
          voucher_type?: Database["public"]["Enums"]["voucher_type"]
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["id"]
          },
        ]
      }
      entidad: {
        Row: {
          address: string
          billing_email: string
          contact_name: string
          created_at: string
          deleted_at: string | null
          document_number: string
          document_type: Database["public"]["Enums"]["document_type"]
          id: string
          is_client: boolean
          is_supplier: boolean
          management_email: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          address?: string
          billing_email: string
          contact_name?: string
          created_at?: string
          deleted_at?: string | null
          document_number?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          is_client?: boolean
          is_supplier?: boolean
          management_email?: string
          name: string
          phone?: string
          updated_at?: string
        }
        Update: {
          address?: string
          billing_email?: string
          contact_name?: string
          created_at?: string
          deleted_at?: string | null
          document_number?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          is_client?: boolean
          is_supplier?: boolean
          management_email?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment: {
        Row: {
          amount: number
          created_at: string
          direction: Database["public"]["Enums"]["payment_direction"]
          entity_id: string
          id: string
          issue_date: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          payment_date: string
          receipt_number: string | null
          receipt_serial: number
          receipt_year: number
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          direction: Database["public"]["Enums"]["payment_direction"]
          entity_id: string
          id?: string
          issue_date?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_date: string
          receipt_number?: string | null
          receipt_serial: number
          receipt_year: number
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          direction?: Database["public"]["Enums"]["payment_direction"]
          entity_id?: string
          id?: string
          issue_date?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_date?: string
          receipt_number?: string | null
          receipt_serial?: number
          receipt_year?: number
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocation: {
        Row: {
          amount: number
          comprobante_id: string
          created_at: string
          id: string
          payment_id: string
        }
        Insert: {
          amount: number
          comprobante_id: string
          created_at?: string
          id?: string
          payment_id: string
        }
        Update: {
          amount?: number
          comprobante_id?: string
          created_at?: string
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocation_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocation_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "voucher_balance"
            referencedColumns: ["comprobante_id"]
          },
          {
            foreignKeyName: "payment_allocation_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocation_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_balance"
            referencedColumns: ["payment_id"]
          },
        ]
      }
      receipt_sequence: {
        Row: {
          direction: Database["public"]["Enums"]["payment_direction"]
          last_serial: number
          year: number
        }
        Insert: {
          direction: Database["public"]["Enums"]["payment_direction"]
          last_serial?: number
          year: number
        }
        Update: {
          direction?: Database["public"]["Enums"]["payment_direction"]
          last_serial?: number
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      payment_balance: {
        Row: {
          amount: number | null
          assigned_amount: number | null
          direction: Database["public"]["Enums"]["payment_direction"] | null
          entity_id: string | null
          payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          unassigned_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_balance: {
        Row: {
          balance: number | null
          comprobante_id: string | null
          effective_due_date: string | null
          entity_id: string | null
          issue_date: string | null
          paid_amount: number | null
          payment_type: Database["public"]["Enums"]["payment_type"] | null
          status: Database["public"]["Enums"]["comprobante_status"] | null
          total: number | null
          voucher_kind: Database["public"]["Enums"]["voucher_kind"] | null
          voucher_number: string | null
          voucher_type: Database["public"]["Enums"]["voucher_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobante_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entidad"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_payment_with_allocations: {
        Args: {
          p_allocations: Json
          p_amount: number
          p_direction: Database["public"]["Enums"]["payment_direction"]
          p_entity_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_notes: string
          p_payment_date: string
          p_reference: string
        }
        Returns: string
      }
    }
    Enums: {
      comprobante_status: "PAGADO" | "PENDIENTE"
      document_type: "SIN_DOCUMENTO" | "RUC" | "DNI" | "CARNET_EXTRANJERIA"
      payment_direction: "INGRESO" | "EGRESO"
      payment_method: "EFECTIVO" | "TRANSFERENCIA_BCP" | "TARJETA_CREDITO"
      payment_status: "REGISTRADO" | "ANULADO"
      payment_type: "CONTADO" | "CREDITO"
      voucher_kind: "COMPRA" | "VENTA"
      voucher_type: "FACTURA" | "BOLETA" | "NOTA_VENTA"
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
      comprobante_status: ["PAGADO", "PENDIENTE"],
      document_type: ["SIN_DOCUMENTO", "RUC", "DNI", "CARNET_EXTRANJERIA"],
      payment_direction: ["INGRESO", "EGRESO"],
      payment_method: ["EFECTIVO", "TRANSFERENCIA_BCP", "TARJETA_CREDITO"],
      payment_status: ["REGISTRADO", "ANULADO"],
      payment_type: ["CONTADO", "CREDITO"],
      voucher_kind: ["COMPRA", "VENTA"],
      voucher_type: ["FACTURA", "BOLETA", "NOTA_VENTA"],
    },
  },
} as const
