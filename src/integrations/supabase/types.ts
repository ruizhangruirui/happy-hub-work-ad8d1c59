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
    PostgrestVersion: "14.17"
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
          deletion_requested_at: string | null
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
          deletion_requested_at?: string | null
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
          deletion_requested_at?: string | null
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
          contract_end_date: string | null
          contract_type: string | null
          created_at: string
          effective_date: string | null
          employment_id: string | null
          employment_type: string | null
          end_date: string | null
          id: string
          joined_at: string | null
          joined_by: string | null
          joined_date: string | null
          last_working_day: string | null
          leaving_reason: string | null
          leaving_type: string | null
          left_at: string | null
          left_by: string | null
          left_date: string | null
          location: string | null
          notes: string | null
          offboarding_snapshot_captured: boolean
          owner_id: string
          person_id: string
          pre_offboarding_end_date: string | null
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
          contract_end_date?: string | null
          contract_type?: string | null
          created_at?: string
          effective_date?: string | null
          employment_id?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string
          joined_at?: string | null
          joined_by?: string | null
          joined_date?: string | null
          last_working_day?: string | null
          leaving_reason?: string | null
          leaving_type?: string | null
          left_at?: string | null
          left_by?: string | null
          left_date?: string | null
          location?: string | null
          notes?: string | null
          offboarding_snapshot_captured?: boolean
          owner_id: string
          person_id: string
          pre_offboarding_end_date?: string | null
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
          contract_end_date?: string | null
          contract_type?: string | null
          created_at?: string
          effective_date?: string | null
          employment_id?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string
          joined_at?: string | null
          joined_by?: string | null
          joined_date?: string | null
          last_working_day?: string | null
          leaving_reason?: string | null
          leaving_type?: string | null
          left_at?: string | null
          left_by?: string | null
          left_date?: string | null
          location?: string | null
          notes?: string | null
          offboarding_snapshot_captured?: boolean
          owner_id?: string
          person_id?: string
          pre_offboarding_end_date?: string | null
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
            foreignKeyName: "cases_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "employment_effective"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_employment_id_fkey"
            columns: ["employment_id"]
            isOneToOne: false
            referencedRelation: "employments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "active_employee_roster"
            referencedColumns: ["person_id"]
          },
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
      checklist_template_items: {
        Row: {
          active: boolean
          applicable_employment_types: string[]
          applicable_leaving_reasons: string[]
          applicable_leaving_types: string[]
          assigned_user_id: string | null
          case_type: string
          created_at: string
          default_assignee_id: string | null
          description: string | null
          due_offset_days: number
          due_reference: string
          due_rule: string
          enabled: boolean
          id: string
          mandatory: boolean
          owner_team: string
          preferred_email_template_id: string | null
          sort_order: number
          task_type: string
          template_id: string
          template_key: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          applicable_employment_types?: string[]
          applicable_leaving_reasons?: string[]
          applicable_leaving_types?: string[]
          assigned_user_id?: string | null
          case_type: string
          created_at?: string
          default_assignee_id?: string | null
          description?: string | null
          due_offset_days?: number
          due_reference?: string
          due_rule?: string
          enabled?: boolean
          id?: string
          mandatory?: boolean
          owner_team: string
          preferred_email_template_id?: string | null
          sort_order?: number
          task_type?: string
          template_id: string
          template_key: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          applicable_employment_types?: string[]
          applicable_leaving_reasons?: string[]
          applicable_leaving_types?: string[]
          assigned_user_id?: string | null
          case_type?: string
          created_at?: string
          default_assignee_id?: string | null
          description?: string | null
          due_offset_days?: number
          due_reference?: string
          due_rule?: string
          enabled?: boolean
          id?: string
          mandatory?: boolean
          owner_team?: string
          preferred_email_template_id?: string | null
          sort_order?: number
          task_type?: string
          template_id?: string
          template_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_preferred_email_template_id_fkey"
            columns: ["preferred_email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          active: boolean
          case_type: string
          created_at: string
          description: string | null
          id: string
          name: string
          template_key: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          case_type: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          template_key: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          case_type?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          template_key?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      email_additional_attachments: {
        Row: {
          case_id: string | null
          communication_id: string | null
          compose_session_id: string
          content_type: string | null
          created_at: string
          deletion_requested_at: string | null
          expires_at: string | null
          filename: string
          id: string
          size: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          case_id?: string | null
          communication_id?: string | null
          compose_session_id: string
          content_type?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          expires_at?: string | null
          filename: string
          id?: string
          size: number
          storage_path: string
          uploaded_by: string
        }
        Update: {
          case_id?: string | null
          communication_id?: string | null
          compose_session_id?: string
          content_type?: string | null
          created_at?: string
          deletion_requested_at?: string | null
          expires_at?: string | null
          filename?: string
          id?: string
          size?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_additional_attachments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_additional_attachments_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "email_communications"
            referencedColumns: ["id"]
          },
        ]
      }
      email_communication_attachment_snapshots: {
        Row: {
          communication_id: string
          content_type: string | null
          created_at: string
          filename: string
          id: string
          size: number
          source: string
          source_attachment_id: string | null
        }
        Insert: {
          communication_id: string
          content_type?: string | null
          created_at?: string
          filename: string
          id?: string
          size: number
          source?: string
          source_attachment_id?: string | null
        }
        Update: {
          communication_id?: string
          content_type?: string | null
          created_at?: string
          filename?: string
          id?: string
          size?: number
          source?: string
          source_attachment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_communication_attachment_snapshots_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "email_communications"
            referencedColumns: ["id"]
          },
        ]
      }
      email_communications: {
        Row: {
          case_id: string | null
          id: string
          marked_sent_at: string | null
          opened_at: string | null
          outlook_mode: string | null
          prepared_at: string
          prepared_by: string
          recipient: string
          rendered_subject: string
          state: string
          task_id: string | null
          template_id: string | null
          template_version: number | null
        }
        Insert: {
          case_id?: string | null
          id?: string
          marked_sent_at?: string | null
          opened_at?: string | null
          outlook_mode?: string | null
          prepared_at?: string
          prepared_by: string
          recipient: string
          rendered_subject: string
          state: string
          task_id?: string | null
          template_id?: string | null
          template_version?: number | null
        }
        Update: {
          case_id?: string | null
          id?: string
          marked_sent_at?: string | null
          opened_at?: string | null
          outlook_mode?: string | null
          prepared_at?: string
          prepared_by?: string
          recipient?: string
          rendered_subject?: string
          state?: string
          task_id?: string | null
          template_id?: string | null
          template_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_communications_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_communications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_communications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_template_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          filename: string
          id: string
          size: number
          storage_path: string
          template_id: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          filename: string
          id?: string
          size?: number
          storage_path: string
          template_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          filename?: string
          id?: string
          size?: number
          storage_path?: string
          template_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_template_attachments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_template_variables: {
        Row: {
          choices: Json
          created_at: string
          data_type: string
          default_value: string | null
          description: string | null
          display_name: string
          id: string
          required: boolean
          template_id: string
          updated_at: string
          variable_key: string
        }
        Insert: {
          choices?: Json
          created_at?: string
          data_type?: string
          default_value?: string | null
          description?: string | null
          display_name: string
          id?: string
          required?: boolean
          template_id: string
          updated_at?: string
          variable_key: string
        }
        Update: {
          choices?: Json
          created_at?: string
          data_type?: string
          default_value?: string | null
          description?: string | null
          display_name?: string
          id?: string
          required?: boolean
          template_id?: string
          updated_at?: string
          variable_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_template_variables_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          applicable_case_types: string[]
          archived_at: string | null
          body_html: string
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          language: string
          name: string
          owner_id: string
          published_at: string | null
          recipient_source: string
          status: string
          subject: string
          updated_at: string
          variables: Json
          version: number
        }
        Insert: {
          applicable_case_types?: string[]
          archived_at?: string | null
          body_html: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          language?: string
          name: string
          owner_id: string
          published_at?: string | null
          recipient_source?: string
          status?: string
          subject: string
          updated_at?: string
          variables?: Json
          version?: number
        }
        Update: {
          applicable_case_types?: string[]
          archived_at?: string | null
          body_html?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          language?: string
          name?: string
          owner_id?: string
          published_at?: string | null
          recipient_source?: string
          status?: string
          subject?: string
          updated_at?: string
          variables?: Json
          version?: number
        }
        Relationships: []
      }
      email_variable_library: {
        Row: {
          active: boolean
          choices: Json
          created_at: string
          data_type: string
          default_value: string | null
          description: string | null
          display_name: string
          id: string
          required: boolean
          source_field: string | null
          source_type: string
          updated_at: string
          variable_key: string
        }
        Insert: {
          active?: boolean
          choices?: Json
          created_at?: string
          data_type?: string
          default_value?: string | null
          description?: string | null
          display_name: string
          id?: string
          required?: boolean
          source_field?: string | null
          source_type: string
          updated_at?: string
          variable_key: string
        }
        Update: {
          active?: boolean
          choices?: Json
          created_at?: string
          data_type?: string
          default_value?: string | null
          description?: string | null
          display_name?: string
          id?: string
          required?: boolean
          source_field?: string | null
          source_type?: string
          updated_at?: string
          variable_key?: string
        }
        Relationships: []
      }
      employments: {
        Row: {
          contract_type: string | null
          created_at: string
          employee_id: string | null
          employment_type: string
          end_date: string | null
          id: string
          location: string | null
          person_id: string
          role_title: string | null
          source_onboarding_case_id: string | null
          start_date: string | null
          status: string
          supervisor_email: string | null
          supervisor_name: string | null
          supervisor_person_id: string | null
          team_id: string | null
          updated_at: string
          workload: number | null
        }
        Insert: {
          contract_type?: string | null
          created_at?: string
          employee_id?: string | null
          employment_type: string
          end_date?: string | null
          id?: string
          location?: string | null
          person_id: string
          role_title?: string | null
          source_onboarding_case_id?: string | null
          start_date?: string | null
          status: string
          supervisor_email?: string | null
          supervisor_name?: string | null
          supervisor_person_id?: string | null
          team_id?: string | null
          updated_at?: string
          workload?: number | null
        }
        Update: {
          contract_type?: string | null
          created_at?: string
          employee_id?: string | null
          employment_type?: string
          end_date?: string | null
          id?: string
          location?: string | null
          person_id?: string
          role_title?: string | null
          source_onboarding_case_id?: string | null
          start_date?: string | null
          status?: string
          supervisor_email?: string | null
          supervisor_name?: string | null
          supervisor_person_id?: string | null
          team_id?: string | null
          updated_at?: string
          workload?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "active_employee_roster"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "employments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employments_source_onboarding_case_id_fkey"
            columns: ["source_onboarding_case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employments_supervisor_person_id_fkey"
            columns: ["supervisor_person_id"]
            isOneToOne: false
            referencedRelation: "active_employee_roster"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "employments_supervisor_person_id_fkey"
            columns: ["supervisor_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      external_collaboration_requests: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          due_date: string | null
          expires_at: string
          id: string
          recipient_email: string
          recipient_name: string | null
          recipient_team: string | null
          request_message: string | null
          responded_at: string | null
          response_note: string | null
          status: string
          token_hash: string
          updated_at: string
          workflow_item_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          due_date?: string | null
          expires_at?: string
          id?: string
          recipient_email: string
          recipient_name?: string | null
          recipient_team?: string | null
          request_message?: string | null
          responded_at?: string | null
          response_note?: string | null
          status?: string
          token_hash: string
          updated_at?: string
          workflow_item_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          due_date?: string | null
          expires_at?: string
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          recipient_team?: string | null
          request_message?: string | null
          responded_at?: string | null
          response_note?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
          workflow_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_collaboration_requests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_collaboration_requests_workflow_item_id_fkey"
            columns: ["workflow_item_id"]
            isOneToOne: false
            referencedRelation: "case_workflow_items"
            referencedColumns: ["id"]
          },
        ]
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
      person_reconciliation_report: {
        Row: {
          canonical_person_id: string | null
          confidence: string
          created_at: string
          details: Json
          duplicate_person_id: string
          id: string
          linked_onboarding_case_id: string | null
          matching_rule: string | null
          migration_status: string
          offboarding_case_id: string
        }
        Insert: {
          canonical_person_id?: string | null
          confidence: string
          created_at?: string
          details?: Json
          duplicate_person_id: string
          id?: string
          linked_onboarding_case_id?: string | null
          matching_rule?: string | null
          migration_status: string
          offboarding_case_id: string
        }
        Update: {
          canonical_person_id?: string | null
          confidence?: string
          created_at?: string
          details?: Json
          duplicate_person_id?: string
          id?: string
          linked_onboarding_case_id?: string | null
          matching_rule?: string | null
          migration_status?: string
          offboarding_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_reconciliation_report_canonical_person_id_fkey"
            columns: ["canonical_person_id"]
            isOneToOne: false
            referencedRelation: "active_employee_roster"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "person_reconciliation_report_canonical_person_id_fkey"
            columns: ["canonical_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_reconciliation_report_duplicate_person_id_fkey"
            columns: ["duplicate_person_id"]
            isOneToOne: false
            referencedRelation: "active_employee_roster"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "person_reconciliation_report_duplicate_person_id_fkey"
            columns: ["duplicate_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_reconciliation_report_linked_onboarding_case_id_fkey"
            columns: ["linked_onboarding_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_reconciliation_report_offboarding_case_id_fkey"
            columns: ["offboarding_case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          archived_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          employee_id: string | null
          family_name: string | null
          first_name: string
          full_name: string
          given_name: string | null
          id: string
          lab_id: string | null
          last_name: string
          manager_id: string | null
          phone: string | null
          preferred_name: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          employee_id?: string | null
          family_name?: string | null
          first_name: string
          full_name: string
          given_name?: string | null
          id?: string
          lab_id?: string | null
          last_name: string
          manager_id?: string | null
          phone?: string | null
          preferred_name?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          employee_id?: string | null
          family_name?: string | null
          first_name?: string
          full_name?: string
          given_name?: string | null
          id?: string
          lab_id?: string | null
          last_name?: string
          manager_id?: string | null
          phone?: string | null
          preferred_name?: string | null
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
            referencedRelation: "active_employee_roster"
            referencedColumns: ["person_id"]
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
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_files: {
        Row: {
          content_type: string | null
          created_at: string
          filename: string
          id: string
          size: number
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          filename: string
          id?: string
          size?: number
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          filename?: string
          id?: string
          size?: number
          storage_path?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_role: string | null
          case_id: string
          checklist_item_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          default_task_key: string | null
          description: string | null
          due_date: string | null
          due_offset_days: number
          due_reference: string | null
          id: string
          mandatory: boolean
          not_applicable_at: string | null
          not_applicable_by: string | null
          not_applicable_reason: string | null
          notes: string | null
          owner_id: string | null
          owner_team: string
          preferred_email_template_id: string | null
          priority: string
          source: string
          source_snapshot: Json
          status: string
          task_type: string
          template_item_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_role?: string | null
          case_id: string
          checklist_item_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          default_task_key?: string | null
          description?: string | null
          due_date?: string | null
          due_offset_days?: number
          due_reference?: string | null
          id?: string
          mandatory?: boolean
          not_applicable_at?: string | null
          not_applicable_by?: string | null
          not_applicable_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          owner_team?: string
          preferred_email_template_id?: string | null
          priority?: string
          source?: string
          source_snapshot?: Json
          status?: string
          task_type?: string
          template_item_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_role?: string | null
          case_id?: string
          checklist_item_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          default_task_key?: string | null
          description?: string | null
          due_date?: string | null
          due_offset_days?: number
          due_reference?: string | null
          id?: string
          mandatory?: boolean
          not_applicable_at?: string | null
          not_applicable_by?: string | null
          not_applicable_reason?: string | null
          notes?: string | null
          owner_id?: string | null
          owner_team?: string
          preferred_email_template_id?: string | null
          priority?: string
          source?: string
          source_snapshot?: Json
          status?: string
          task_type?: string
          template_item_id?: string | null
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
          {
            foreignKeyName: "tasks_preferred_email_template_id_fkey"
            columns: ["preferred_email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_items"
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
      user_operational_teams: {
        Row: {
          created_at: string
          owner_team: string
          user_id: string
        }
        Insert: {
          created_at?: string
          owner_team: string
          user_id: string
        }
        Update: {
          created_at?: string
          owner_team?: string
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
      active_employee_roster: {
        Row: {
          case_id: string | null
          email: string | null
          employee_id: string | null
          employment_type: string | null
          full_name: string | null
          last_working_day: string | null
          leaving: boolean | null
          location: string | null
          person_id: string | null
          phone: string | null
          role: string | null
          start_date: string | null
          supervisor_name: string | null
          team_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employments_source_onboarding_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_effective: {
        Row: {
          contract_type: string | null
          created_at: string | null
          effective_status: string | null
          employee_id: string | null
          employment_type: string | null
          end_date: string | null
          id: string | null
          location: string | null
          person_id: string | null
          role_title: string | null
          source_onboarding_case_id: string | null
          start_date: string | null
          status: string | null
          supervisor_email: string | null
          supervisor_name: string | null
          supervisor_person_id: string | null
          team_id: string | null
          updated_at: string | null
          workload: number | null
        }
        Insert: {
          contract_type?: string | null
          created_at?: string | null
          effective_status?: never
          employee_id?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string | null
          location?: string | null
          person_id?: string | null
          role_title?: string | null
          source_onboarding_case_id?: string | null
          start_date?: string | null
          status?: string | null
          supervisor_email?: string | null
          supervisor_name?: string | null
          supervisor_person_id?: string | null
          team_id?: string | null
          updated_at?: string | null
          workload?: number | null
        }
        Update: {
          contract_type?: string | null
          created_at?: string | null
          effective_status?: never
          employee_id?: string | null
          employment_type?: string | null
          end_date?: string | null
          id?: string | null
          location?: string | null
          person_id?: string | null
          role_title?: string | null
          source_onboarding_case_id?: string | null
          start_date?: string | null
          status?: string | null
          supervisor_email?: string | null
          supervisor_name?: string | null
          supervisor_person_id?: string | null
          team_id?: string | null
          updated_at?: string | null
          workload?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "active_employee_roster"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "employments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employments_source_onboarding_case_id_fkey"
            columns: ["source_onboarding_case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employments_supervisor_person_id_fkey"
            columns: ["supervisor_person_id"]
            isOneToOne: false
            referencedRelation: "active_employee_roster"
            referencedColumns: ["person_id"]
          },
          {
            foreignKeyName: "employments_supervisor_person_id_fkey"
            columns: ["supervisor_person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _sync_case_tasks_internal: {
        Args: { _case_id: string; _reason?: string }
        Returns: Json
      }
      add_task_comment: {
        Args: { _body: string; _task_id: string }
        Returns: string
      }
      assign_checklist_owner: {
        Args: { _assignee_id: string; _item_id: string }
        Returns: boolean
      }
      assign_task: {
        Args: { _assignee_id: string; _task_id: string }
        Returns: boolean
      }
      bind_email_compose_attachments: {
        Args: { _communication_id: string; _compose_session_id: string }
        Returns: number
      }
      business_date: { Args: never; Returns: string }
      calculate_case_task_due_date: {
        Args: { _case_id: string; _offset?: number; _rule: string }
        Returns: string
      }
      can_access_employment: {
        Args: { _employment_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_person: {
        Args: { _person_id: string; _user_id: string }
        Returns: boolean
      }
      can_compose_case_email: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
      can_confirm_lifecycle_case: {
        Args: { _case_id: string }
        Returns: boolean
      }
      can_manage_case: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_email_templates: {
        Args: { _user_id: string }
        Returns: boolean
      }
      can_manage_person: {
        Args: { _person_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      can_report_hr_case: {
        Args: { _case_id: string; _user_id: string }
        Returns: boolean
      }
      can_update_task: {
        Args: { _task_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_operational_membership: {
        Args: { _owner_team: string; _user_id: string }
        Returns: boolean
      }
      can_view_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      case_access: {
        Args: { _case_id: string; _user_id: string }
        Returns: string
      }
      checklist_item_applies: {
        Args: {
          _case: Database["public"]["Tables"]["cases"]["Row"]
          _item: Database["public"]["Tables"]["checklist_template_items"]["Row"]
        }
        Returns: boolean
      }
      cleanup_abandoned_email_attachments: { Args: never; Returns: string[] }
      complete_email_task: {
        Args: {
          _body: string
          _case_id: string
          _recipient: string
          _subject: string
          _task_id: string
          _template_id: string
        }
        Returns: boolean
      }
      confirm_joined: {
        Args: { _case_id: string; _joined_date?: string }
        Returns: Json
      }
      confirm_left: {
        Args: { _case_id: string; _leaving_date?: string }
        Returns: Json
      }
      create_external_collaboration_request: {
        Args: {
          _due_date?: string
          _recipient_email: string
          _recipient_name?: string
          _recipient_team?: string
          _request_message?: string
          _workflow_item_id: string
        }
        Returns: Json
      }
      create_manual_task: {
        Args: {
          _assignee_id: string
          _case_id: string
          _description: string
          _due_date: string
          _mandatory: boolean
          _owner_team: string
          _priority: string
          _title: string
        }
        Returns: string
      }
      create_offboarding_case_v2: {
        Args: {
          _effective_date: string
          _employment_id: string
          _leaving_reason: string
          _leaving_type: string
          _notes: string
          _person_id: string
          _priority: string
        }
        Returns: Json
      }
      create_offboarding_case_v3: {
        Args: {
          _contract_end_date: string
          _employment_id: string
          _last_working_day: string
          _leaving_reason: string
          _leaving_type: string
          _notes: string
          _person_id: string
          _priority: string
        }
        Returns: Json
      }
      create_onboarding_case_v2: {
        Args: {
          _effective_date: string
          _email: string
          _employee_id: string
          _employment_type: string
          _existing_person_id: string
          _family_name: string
          _given_name: string
          _location: string
          _notes: string
          _preferred_name: string
          _priority: string
          _role_title: string
          _supervisor_email: string
          _supervisor_name: string
          _team_id: string
          _visa_required: boolean
          _workload: number
        }
        Returns: Json
      }
      employment_type_code: { Args: { _value: string }; Returns: string }
      finalize_abandoned_email_attachment_cleanup: {
        Args: { _storage_paths: string[] }
        Returns: number
      }
      finalize_case_file_deletion: {
        Args: { _file_id: string }
        Returns: boolean
      }
      finalize_temporary_email_attachment_deletion: {
        Args: { _attachment_id: string }
        Returns: boolean
      }
      find_onboarding_person_candidates: {
        Args: {
          _email: string
          _employee_id: string
          _full_name: string
          _team_id: string
        }
        Returns: {
          accessible: boolean
          display_name: string
          email: string
          employee_id: string
          last_employment_type: string
          last_end_date: string
          last_team: string
          match_reason: string
          match_strength: string
          person_id: string
        }[]
      }
      generate_case_tasks: { Args: { _case_id: string }; Returns: number }
      get_case_capabilities: { Args: { _case_id: string }; Returns: Json }
      get_effective_employment_status: {
        Args: { _as_of?: string; _employment_id: string }
        Returns: string
      }
      get_external_collaboration_request: {
        Args: { _recipient_email: string; _token: string }
        Returns: Json
      }
      get_operational_case_summary: {
        Args: { _case_id: string }
        Returns: Json
      }
      get_operations_overview: {
        Args: {
          _case_type?: string
          _date_from?: string
          _date_to?: string
          _employment_type?: string
          _status?: string
          _team?: string
        }
        Returns: Json
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
      is_hr_user: { Args: { _user_id: string }; Returns: boolean }
      is_operational_team_member: {
        Args: { _owner_team: string; _user_id: string }
        Returns: boolean
      }
      leaving_type_code: { Args: { _value: string }; Returns: string }
      list_email_eligible_case_ids: { Args: never; Returns: string[] }
      list_operational_tasks: {
        Args: { _case_id?: string }
        Returns: {
          assignee_role: string
          can_edit: boolean
          case_id: string
          case_type: string
          checklist_item_id: string
          completed_at: string
          completed_by_name: string
          contract_end_date: string
          default_task_key: string
          description: string
          due_date: string
          id: string
          last_working_day: string
          mandatory: boolean
          not_applicable_reason: string
          owner_id: string
          owner_name: string
          owner_team: string
          person_name: string
          person_team: string
          preferred_email_template_id: string
          priority: string
          source: string
          start_date: string
          status: string
          task_type: string
          template_item_id: string
          title: string
        }[]
      }
      list_people_page: {
        Args: {
          _page?: number
          _page_size?: number
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      list_profile_directory: {
        Args: never
        Returns: {
          id: string
          name: string
          status: string
          title: string
        }[]
      }
      normalize_employee_id: { Args: { _value: string }; Returns: string }
      record_email_event:
        | {
            Args: {
              _case_id: string
              _communication_id?: string
              _recipient: string
              _state: string
              _subject: string
              _task_id: string
              _template_id: string
              _template_version: number
            }
            Returns: string
          }
        | {
            Args: {
              _case_id: string
              _communication_id: string
              _outlook_mode: string
              _recipient: string
              _state: string
              _subject: string
              _task_id: string
              _template_id: string
              _template_version: number
            }
            Returns: string
          }
      refresh_case_workflow_status: {
        Args: { _case_id: string }
        Returns: undefined
      }
      reopen_case_workflow: { Args: { _case_id: string }; Returns: Json }
      replace_email_template_variables: {
        Args: { _template_id: string; _variables: Json }
        Returns: undefined
      }
      request_case_file_deletion: {
        Args: { _file_id: string }
        Returns: string
      }
      request_temporary_email_attachment_deletion: {
        Args: { _attachment_id: string }
        Returns: string
      }
      resolve_case_task_due_date: {
        Args: { _case_id: string; _offset?: number; _reference: string }
        Returns: string
      }
      respond_external_collaboration_request: {
        Args: {
          _recipient_email: string
          _response_note?: string
          _status: string
          _token: string
        }
        Returns: boolean
      }
      set_checklist_completion: {
        Args: { _complete: boolean; _item_id: string }
        Returns: undefined
      }
      set_task_completion: {
        Args: { _complete: boolean; _task_id: string }
        Returns: undefined
      }
      set_task_status: {
        Args: { _comment?: string; _status: string; _task_id: string }
        Returns: boolean
      }
      sync_case_tasks: {
        Args: { _case_id: string; _reason?: string }
        Returns: Json
      }
      transition_lifecycle_case: {
        Args: { _case_id: string; _confirm: boolean }
        Returns: Json
      }
      update_offboarding_dates: {
        Args: {
          _case_id: string
          _contract_end_date: string
          _last_working_day: string
        }
        Returns: Json
      }
      update_person_identity: {
        Args: {
          _email: string
          _employee_id: string
          _person_id: string
          _phone: string
        }
        Returns: Json
      }
      validate_email_template_for_publish: {
        Args: { _template_id: string }
        Returns: string[]
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
