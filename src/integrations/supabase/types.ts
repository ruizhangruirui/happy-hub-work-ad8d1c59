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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          case_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          field: string | null
          id: string
          metadata: Json | null
          new_value: string | null
          previous_value: string | null
        }
        Insert: {
          action: string
          actor_id: string
          case_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          field?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          previous_value?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          case_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          field?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          previous_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_files: {
        Row: {
          case_id: string
          content_type: string | null
          created_at: string
          filename: string
          id: string
          size: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          case_id: string
          content_type?: string | null
          created_at?: string
          filename: string
          id?: string
          size?: number
          storage_path: string
          uploaded_by: string
        }
        Update: {
          case_id?: string
          content_type?: string | null
          created_at?: string
          filename?: string
          id?: string
          size?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_files_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_members: {
        Row: {
          access_level: Database["public"]["Enums"]["member_access"]
          case_id: string
          created_at: string
          created_by: string
          id: string
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level: Database["public"]["Enums"]["member_access"]
          case_id: string
          created_at?: string
          created_by: string
          id?: string
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["member_access"]
          case_id?: string
          created_at?: string
          created_by?: string
          id?: string
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_members_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_workflow_items: {
        Row: {
          case_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          id: string
          sequence: number
          status: string
          step_key: string
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          sequence: number
          status?: string
          step_key: string
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          sequence?: number
          status?: string
          step_key?: string
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_workflow_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          archived_at: string | null
          case_type: string
          contract_type: string | null
          created_at: string
          employment_type: string | null
          end_date: string | null
          id: string
          location: string | null
          notes: string | null
          owner_id: string
          person_id: string
          priority: string
          role: string | null
          start_date: string | null
          status: string
          supervisor_email: string | null
          supervisor_name: string | null
          updated_at: string
          visa_required: boolean
          workload: number | null
        }
        Insert: {
          archived_at?: string | null
          case_type: string
          contract_type?: string | null
          created_at?: string
          employment_type?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          owner_id: string
          person_id: string
          priority?: string
          role?: string | null
          start_date?: string | null
          status?: string
          supervisor_email?: string | null
          supervisor_name?: string | null
          updated_at?: string
          visa_required?: boolean
          workload?: number | null
        }
        Update: {
          archived_at?: string | null
          case_type?: string
          contract_type?: string | null
          created_at?: string
          employment_type?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          owner_id?: string
          person_id?: string
          priority?: string
          role?: string | null
          start_date?: string | null
          status?: string
          supervisor_email?: string | null
          supervisor_name?: string | null
          updated_at?: string
          visa_required?: boolean
          workload?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          case_id: string
          completed_by: string | null
          completed_date: string | null
          created_at: string
          due_date: string | null
          id: string
          owner_id: string | null
          section: string
          sort_order: number
          status: string
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          case_id: string
          completed_by?: string | null
          completed_date?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          owner_id?: string | null
          section: string
          sort_order?: number
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          completed_by?: string | null
          completed_date?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          owner_id?: string | null
          section?: string
          sort_order?: number
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          category: string
          created_at: string
          description: string | null
          id: string
          language: string
          name: string
          owner_id: string
          status: string
          subject: string
          updated_at: string
          variables: Json
          version: number
        }
        Insert: {
          body_html: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          language?: string
          name: string
          owner_id: string
          status?: string
          subject: string
          updated_at?: string
          variables?: Json
          version?: number
        }
        Update: {
          body_html?: string
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          language?: string
          name?: string
          owner_id?: string
          status?: string
          subject?: string
          updated_at?: string
          variables?: Json
          version?: number
        }
        Relationships: []
      }
      labs: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      persons: {
        Row: {
          archived_at: string | null
          created_at: string
          email: string | null
          employee_id: string | null
          first_name: string
          full_name: string
          id: string
          lab_id: string | null
          last_name: string
          manager_id: string | null
          phone: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          first_name: string
          full_name: string
          id?: string
          lab_id?: string | null
          last_name: string
          manager_id?: string | null
          phone?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          email?: string | null
          employee_id?: string | null
          first_name?: string
          full_name?: string
          id?: string
          lab_id?: string | null
          last_name?: string
          manager_id?: string | null
          phone?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "persons_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          case_id: string
          checklist_item_id: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          owner_id: string
          priority: string
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          case_id: string
          checklist_item_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          owner_id: string
          priority?: string
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          checklist_item_id?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          owner_id?: string
          priority?: string
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_checklist_item_fk"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          lab_id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lab_id: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lab_id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_scopes: {
        Row: {
          created_at: string
          id: string
          lab_id: string | null
          scope_type: Database["public"]["Enums"]["scope_type"]
          team_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lab_id?: string | null
          scope_type: Database["public"]["Enums"]["scope_type"]
          team_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lab_id?: string | null
          scope_type?: Database["public"]["Enums"]["scope_type"]
          team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_scopes_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      case_access: {
        Args: { _case_id: string; _user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_case_workflow: {
        Args: { _case_id: string }
        Returns: undefined
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      set_checklist_completion: {
        Args: { _complete: boolean; _item_id: string }
        Returns: undefined
      }
      set_task_completion: {
        Args: { _complete: boolean; _task_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "manager" | "viewer"
      member_access: "viewer" | "collaborator"
      scope_type: "all_organization" | "lab" | "team" | "assigned_cases"
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
      app_role: ["admin", "operator", "manager", "viewer"],
      member_access: ["viewer", "collaborator"],
      scope_type: ["all_organization", "lab", "team", "assigned_cases"],
    },
  },
} as const
