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
      automatiseringen: {
        Row: {
          afhankelijkheden: string
          ai_description: string | null
          ai_description_updated_at: string | null
          ai_enrichment: Json | null
          approved_at: string | null
          approved_by: string | null
          bpmn_cluster: string | null
          bpmn_type: string | null
          branches: Json | null
          categorie: string
          created_at: string
          created_by: string | null
          doel: string
          endpoints: string[]
          external_id: string | null
          fasen: string[]
          geverifieerd_door: string
          gitlab_file_path: string | null
          gitlab_last_commit: string | null
          id: string
          import_proposal: Json | null
          import_source: string | null
          import_status: string | null
          laatst_geverifieerd: string | null
          last_synced_at: string | null
          mermaid_diagram: string
          naam: string
          owner: string
          phase: string | null
          pipeline_id: string | null
          rejected_at: string | null
          rejection_reason: string | null
          reviewer_overrides: Json | null
          source: string | null
          stage_id: string | null
          stappen: string[]
          status: string
          systemen: string[]
          team_role: string | null
          trigger_beschrijving: string
          verbeterideeen: string
          webhook_paths: string[]
        }
        Insert: {
          afhankelijkheden?: string
          ai_description?: string | null
          ai_description_updated_at?: string | null
          ai_enrichment?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          bpmn_cluster?: string | null
          bpmn_type?: string | null
          branches?: Json | null
          categorie?: string
          created_at?: string
          created_by?: string | null
          doel?: string
          endpoints?: string[]
          external_id?: string | null
          fasen?: string[]
          geverifieerd_door?: string
          gitlab_file_path?: string | null
          gitlab_last_commit?: string | null
          id: string
          import_proposal?: Json | null
          import_source?: string | null
          import_status?: string | null
          laatst_geverifieerd?: string | null
          last_synced_at?: string | null
          mermaid_diagram?: string
          naam: string
          owner?: string
          phase?: string | null
          pipeline_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reviewer_overrides?: Json | null
          source?: string | null
          stage_id?: string | null
          stappen?: string[]
          status?: string
          systemen?: string[]
          team_role?: string | null
          trigger_beschrijving?: string
          verbeterideeen?: string
          webhook_paths?: string[]
        }
        Update: {
          afhankelijkheden?: string
          ai_description?: string | null
          ai_description_updated_at?: string | null
          ai_enrichment?: Json | null
          approved_at?: string | null
          approved_by?: string | null
          bpmn_cluster?: string | null
          bpmn_type?: string | null
          branches?: Json | null
          categorie?: string
          created_at?: string
          created_by?: string | null
          doel?: string
          endpoints?: string[]
          external_id?: string | null
          fasen?: string[]
          geverifieerd_door?: string
          gitlab_file_path?: string | null
          gitlab_last_commit?: string | null
          id?: string
          import_proposal?: Json | null
          import_source?: string | null
          import_status?: string | null
          laatst_geverifieerd?: string | null
          last_synced_at?: string | null
          mermaid_diagram?: string
          naam?: string
          owner?: string
          phase?: string | null
          pipeline_id?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          reviewer_overrides?: Json | null
          source?: string | null
          stage_id?: string | null
          stappen?: string[]
          status?: string
          systemen?: string[]
          team_role?: string | null
          trigger_beschrijving?: string
          verbeterideeen?: string
          webhook_paths?: string[]
        }
        Relationships: []
      }
      automatisering_ai_flows: {
        Row: {
          cluster: string | null
          confidence: number
          confirmed: boolean
          created_at: string
          from_id: string
          id: string
          reasoning: string | null
          rejected: boolean
          to_id: string
        }
        Insert: {
          cluster?: string | null
          confidence?: number
          confirmed?: boolean
          created_at?: string
          from_id: string
          id?: string
          reasoning?: string | null
          rejected?: boolean
          to_id: string
        }
        Update: {
          cluster?: string | null
          confidence?: number
          confirmed?: boolean
          created_at?: string
          from_id?: string
          id?: string
          reasoning?: string | null
          rejected?: boolean
          to_id?: string
        }
        Relationships: []
      }
      automation_links: {
        Row: {
          confirmed: boolean
          created_at: string
          id: string
          match_type: string
          source_id: string
          sync_run_id: string | null
          target_id: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          id?: string
          match_type: string
          source_id: string
          sync_run_id?: string | null
          target_id: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          id?: string
          match_type?: string
          source_id?: string
          sync_run_id?: string | null
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_links_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "automatiseringen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_links_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "automatiseringen"
            referencedColumns: ["id"]
          },
        ]
      }
      brandy_feedback: {
        Row: {
          antwoord: string
          created_at: string | null
          id: string
          label: string
          vraag: string
        }
        Insert: {
          antwoord: string
          created_at?: string | null
          id?: string
          label: string
          vraag: string
        }
        Update: {
          antwoord?: string
          created_at?: string | null
          id?: string
          label?: string
          vraag?: string
        }
        Relationships: []
      }
      brandy_mind: {
        Row: {
          aangemaakt_op: string
          automation_count: number
          id: string
          prioriteiten: Json
          samenvatting: string
          signalen: Json
          suggesties: Json
        }
        Insert: {
          aangemaakt_op?: string
          automation_count: number
          id?: string
          prioriteiten: Json
          samenvatting: string
          signalen: Json
          suggesties?: Json
        }
        Update: {
          aangemaakt_op?: string
          automation_count?: number
          id?: string
          prioriteiten?: Json
          samenvatting?: string
          signalen?: Json
          suggesties?: Json
        }
        Relationships: []
      }
      flows: {
        Row: {
          automation_ids: string[] | null
          beschrijving: string | null
          created_at: string | null
          id: string
          naam: string
          stappen_beschrijving: Json | null
          stappen_bijgewerkt_at: string | null
          systemen: string[] | null
          updated_at: string | null
        }
        Insert: {
          automation_ids?: string[] | null
          beschrijving?: string | null
          created_at?: string | null
          id?: string
          naam: string
          stappen_beschrijving?: Json | null
          stappen_bijgewerkt_at?: string | null
          systemen?: string[] | null
          updated_at?: string | null
        }
        Update: {
          automation_ids?: string[] | null
          beschrijving?: string | null
          created_at?: string | null
          id?: string
          naam?: string
          stappen_beschrijving?: Json | null
          stappen_bijgewerkt_at?: string | null
          systemen?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      integrations: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          last_synced_at: string | null
          status: string
          token: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          status?: string
          token: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_synced_at?: string | null
          status?: string
          token?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      koppelingen: {
        Row: {
          bron_id: string
          created_at: string
          doel_id: string
          id: string
          label: string
        }
        Insert: {
          bron_id: string
          created_at?: string
          doel_id: string
          id?: string
          label?: string
        }
        Update: {
          bron_id?: string
          created_at?: string
          doel_id?: string
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "koppelingen_bron_id_fkey"
            columns: ["bron_id"]
            isOneToOne: false
            referencedRelation: "automatiseringen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "koppelingen_doel_id_fkey"
            columns: ["doel_id"]
            isOneToOne: false
            referencedRelation: "automatiseringen"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          beschrijving: string | null
          is_active: boolean
          naam: string
          pipeline_id: string
          stages: Json
          synced_at: string
        }
        Insert: {
          beschrijving?: string | null
          is_active?: boolean
          naam: string
          pipeline_id: string
          stages?: Json
          synced_at?: string
        }
        Update: {
          beschrijving?: string | null
          is_active?: boolean
          naam?: string
          pipeline_id?: string
          stages?: Json
          synced_at?: string
        }
        Relationships: []
      }
      portal_settings: {
        Row: {
          id: string
          settings: Json
          updated_at: string | null
        }
        Insert: {
          id?: string
          settings?: Json
          updated_at?: string | null
        }
        Update: {
          id?: string
          settings?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      process_state: {
        Row: {
          active_lanes: Json | null
          auto_links: Json
          connections: Json
          custom_lanes: Json | null
          id: string
          parked_steps: Json
          steps: Json
          updated_at: string | null
        }
        Insert: {
          active_lanes?: Json | null
          auto_links?: Json
          connections?: Json
          custom_lanes?: Json | null
          id?: string
          parked_steps?: Json
          steps?: Json
          updated_at?: string | null
        }
        Update: {
          active_lanes?: Json | null
          auto_links?: Json
          connections?: Json
          custom_lanes?: Json | null
          id?: string
          parked_steps?: Json
          steps?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_auto_id: { Args: never; Returns: string }
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
