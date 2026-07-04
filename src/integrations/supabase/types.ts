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
      advance_payment_sources: {
        Row: {
          created_at: string
          id: string
          name: string
          requires_txn_id: boolean
          sort_order: number
          updated_at: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          requires_txn_id?: boolean
          sort_order?: number
          updated_at?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          requires_txn_id?: boolean
          sort_order?: number
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          active_invoice_template: string
          active_sticker_template: string
          bdcourier_api_key: string | null
          business_address: string | null
          business_name: string | null
          business_phone: string | null
          default_order_template_desktop: string
          default_order_template_mobile: string
          default_tele_template_desktop: string
          default_tele_template_mobile: string
          id: boolean
          invoice_include_year: boolean
          invoice_pad_length: number
          invoice_prefix: string
          invoice_seq: number
          invoice_suffix: string
          invoice_year: number
          logo_url: string | null
          membership_discount_enabled: boolean
          membership_discount_rate: number
          report_courier_charge: number
          return_delivery_charge: number
          return_packing_cost: number
          updated_at: string
          vip_order_threshold: number
          vip_spend_threshold: number
        }
        Insert: {
          active_invoice_template?: string
          active_sticker_template?: string
          bdcourier_api_key?: string | null
          business_address?: string | null
          business_name?: string | null
          business_phone?: string | null
          default_order_template_desktop?: string
          default_order_template_mobile?: string
          default_tele_template_desktop?: string
          default_tele_template_mobile?: string
          id?: boolean
          invoice_include_year?: boolean
          invoice_pad_length?: number
          invoice_prefix?: string
          invoice_seq?: number
          invoice_suffix?: string
          invoice_year?: number
          logo_url?: string | null
          membership_discount_enabled?: boolean
          membership_discount_rate?: number
          report_courier_charge?: number
          return_delivery_charge?: number
          return_packing_cost?: number
          updated_at?: string
          vip_order_threshold?: number
          vip_spend_threshold?: number
        }
        Update: {
          active_invoice_template?: string
          active_sticker_template?: string
          bdcourier_api_key?: string | null
          business_address?: string | null
          business_name?: string | null
          business_phone?: string | null
          default_order_template_desktop?: string
          default_order_template_mobile?: string
          default_tele_template_desktop?: string
          default_tele_template_mobile?: string
          id?: boolean
          invoice_include_year?: boolean
          invoice_pad_length?: number
          invoice_prefix?: string
          invoice_seq?: number
          invoice_suffix?: string
          invoice_year?: number
          logo_url?: string | null
          membership_discount_enabled?: boolean
          membership_discount_rate?: number
          report_courier_charge?: number
          return_delivery_charge?: number
          return_packing_cost?: number
          updated_at?: string
          vip_order_threshold?: number
          vip_spend_threshold?: number
        }
        Relationships: []
      }
      blocked_customers: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          ip_address: unknown
          phone_normalized: string | null
          reason: string
          updated_at: string
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          phone_normalized?: string | null
          reason: string
          updated_at?: string
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          phone_normalized?: string | null
          reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          read_at: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      couriers: {
        Row: {
          api_key: string | null
          base_url: string | null
          created_at: string
          id: string
          invoice_template_id: string | null
          is_default: boolean
          kind: string
          logo_url: string | null
          name: string
          provider: string | null
          secret_key: string | null
          status: Database["public"]["Enums"]["entity_status"]
          sticker_template_id: string | null
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          invoice_template_id?: string | null
          is_default?: boolean
          kind?: string
          logo_url?: string | null
          name: string
          provider?: string | null
          secret_key?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          sticker_template_id?: string | null
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          base_url?: string | null
          created_at?: string
          id?: string
          invoice_template_id?: string | null
          is_default?: boolean
          kind?: string
          logo_url?: string | null
          name?: string
          provider?: string | null
          secret_key?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          sticker_template_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_complaints: {
        Row: {
          category: Database["public"]["Enums"]["complaint_category"]
          created_at: string
          created_by: string | null
          customer_name: string | null
          id: string
          note: string
          order_id: string | null
          phone: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["complaint_severity"]
          status: Database["public"]["Enums"]["complaint_status"]
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["complaint_category"]
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          id?: string
          note: string
          order_id?: string | null
          phone: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["complaint_severity"]
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["complaint_category"]
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          id?: string
          note?: string
          order_id?: string | null
          phone?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["complaint_severity"]
          status?: Database["public"]["Enums"]["complaint_status"]
          updated_at?: string
        }
        Relationships: []
      }
      customer_tag_discounts: {
        Row: {
          enabled: boolean
          rate: number
          tag: Database["public"]["Enums"]["customer_tag"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          rate?: number
          tag: Database["public"]["Enums"]["customer_tag"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          rate?: number
          tag?: Database["public"]["Enums"]["customer_tag"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      customer_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          phone: string
          tag: Database["public"]["Enums"]["customer_tag"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          phone: string
          tag: Database["public"]["Enums"]["customer_tag"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          phone?: string
          tag?: Database["public"]["Enums"]["customer_tag"]
        }
        Relationships: []
      }
      expense_rules: {
        Row: {
          amount: number
          assigned_user_id: string | null
          category: string | null
          created_at: string
          created_by: string | null
          enabled: boolean
          end_date: string | null
          frequency: Database["public"]["Enums"]["expense_frequency"]
          id: string
          name: string
          note: string | null
          per_order_amount: number
          per_order_pct: number
          start_date: string
          updated_at: string
        }
        Insert: {
          amount?: number
          assigned_user_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["expense_frequency"]
          id?: string
          name: string
          note?: string | null
          per_order_amount?: number
          per_order_pct?: number
          start_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          assigned_user_id?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["expense_frequency"]
          id?: string
          name?: string
          note?: string | null
          per_order_amount?: number
          per_order_pct?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          incurred_on: string
          note: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          incurred_on?: string
          note?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          incurred_on?: string
          note?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      facebook_pages: {
        Row: {
          access_token: string | null
          connected_at: string
          id: string
          page_id: string
          page_name: string
          status: string
          token_status: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string
          id?: string
          page_id: string
          page_name: string
          status?: string
          token_status?: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string
          id?: string
          page_id?: string
          page_name?: string
          status?: string
          token_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      facebook_settings: {
        Row: {
          access_token: string | null
          app_id: string | null
          app_secret: string | null
          enabled: boolean
          id: boolean
          updated_at: string
          verify_token: string | null
          webhook_secret: string | null
        }
        Insert: {
          access_token?: string | null
          app_id?: string | null
          app_secret?: string | null
          enabled?: boolean
          id?: boolean
          updated_at?: string
          verify_token?: string | null
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string | null
          app_id?: string | null
          app_secret?: string | null
          enabled?: boolean
          id?: boolean
          updated_at?: string
          verify_token?: string | null
          webhook_secret?: string | null
        }
        Relationships: []
      }
      facebook_webhook_logs: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          http_status: number | null
          id: string
          order_id: string | null
          page_id: string | null
          page_name: string | null
          payload: Json | null
          response: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          order_id?: string | null
          page_id?: string | null
          page_name?: string | null
          payload?: Json | null
          response?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          order_id?: string | null
          page_id?: string | null
          page_name?: string | null
          payload?: Json | null
          response?: Json | null
          status?: string
        }
        Relationships: []
      }
      imported_customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string | null
          phone: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          phone: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string | null
          phone?: string
        }
        Relationships: []
      }
      inactivity_lock_events: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          locked_at: string
          unlocked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          locked_at?: string
          unlocked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          locked_at?: string
          unlocked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      inactivity_lock_pauses: {
        Row: {
          created_at: string
          duration_minutes: number
          ended_at: string | null
          expires_at: string
          id: string
          paused_at: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          ended_at?: string | null
          expires_at: string
          id?: string
          paused_at?: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          expires_at?: string
          id?: string
          paused_at?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          consumer_key: string | null
          consumer_secret: string | null
          created_at: string
          enabled: boolean
          id: string
          name: string | null
          plugin_signature: string | null
          provider: string
          site_url: string | null
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          consumer_key?: string | null
          consumer_secret?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string | null
          plugin_signature?: string | null
          provider: string
          site_url?: string | null
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          consumer_key?: string | null
          consumer_secret?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string | null
          plugin_signature?: string | null
          provider?: string
          site_url?: string | null
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      inventory_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          type: string
          unit_cost: number
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          type: string
          unit_cost?: number
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          unit_cost?: number
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_customers: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          id: string
          name: string | null
          notes: string | null
          phone: string
          tier: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          phone: string
          tier?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          phone?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      meta_ad_expenses: {
        Row: {
          account_id: string
          campaign_id: string | null
          campaign_name: string | null
          expense_date: string
          id: string
          spend_bdt: number
          spend_usd: number
          synced_at: string
          usd_rate: number
        }
        Insert: {
          account_id: string
          campaign_id?: string | null
          campaign_name?: string | null
          expense_date: string
          id?: string
          spend_bdt?: number
          spend_usd?: number
          synced_at?: string
          usd_rate?: number
        }
        Update: {
          account_id?: string
          campaign_id?: string | null
          campaign_name?: string | null
          expense_date?: string
          id?: string
          spend_bdt?: number
          spend_usd?: number
          synced_at?: string
          usd_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "meta_ads_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ads_accounts: {
        Row: {
          access_token: string
          account_currency: string | null
          account_name: string
          active: boolean
          ad_account_id: string
          app_id: string
          app_secret: string
          created_at: string
          created_by: string | null
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          status: string
          updated_at: string
          usd_rate: number
        }
        Insert: {
          access_token: string
          account_currency?: string | null
          account_name: string
          active?: boolean
          ad_account_id: string
          app_id: string
          app_secret: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          status?: string
          updated_at?: string
          usd_rate?: number
        }
        Update: {
          access_token?: string
          account_currency?: string | null
          account_name?: string
          active?: boolean
          ad_account_id?: string
          app_id?: string
          app_secret?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          status?: string
          updated_at?: string
          usd_rate?: number
        }
        Relationships: []
      }
      note_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          label: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          label: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      notices: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          id: string
          message: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          updated_at?: string
        }
        Relationships: []
      }
      oms_destinations: {
        Row: {
          active: boolean
          api_token: string
          auto_forward: boolean
          created_at: string
          created_by: string | null
          id: string
          name: string
          products_url: string | null
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          api_token: string
          auto_forward?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          products_url?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          api_token?: string
          auto_forward?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          products_url?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      oms_forward_logs: {
        Row: {
          created_at: string
          created_by: string | null
          destination_id: string | null
          destination_name: string | null
          direction: string
          error_message: string | null
          http_status: number | null
          id: string
          order_id: string | null
          payload_excerpt: string | null
          remote_order_no: string | null
          response_excerpt: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          destination_name?: string | null
          direction: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          order_id?: string | null
          payload_excerpt?: string | null
          remote_order_no?: string | null
          response_excerpt?: string | null
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination_id?: string | null
          destination_name?: string | null
          direction?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          order_id?: string | null
          payload_excerpt?: string | null
          remote_order_no?: string | null
          response_excerpt?: string | null
          status?: string
        }
        Relationships: []
      }
      oms_inbound_product_access: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oms_inbound_product_access_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oms_inbound_product_access_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "oms_inbound_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      oms_inbound_settings: {
        Row: {
          active: boolean
          api_token: string
          created_at: string
          created_by: string | null
          default_courier_id: string | null
          id: string
          sender_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_token: string
          created_at?: string
          created_by?: string | null
          default_courier_id?: string | null
          id?: string
          sender_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_token?: string
          created_at?: string
          created_by?: string | null
          default_courier_id?: string | null
          id?: string
          sender_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oms_inbound_settings_default_courier_id_fkey"
            columns: ["default_courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_custom_fields: {
        Row: {
          created_at: string
          id: string
          key: string
          order_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          order_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          order_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_custom_fields_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "incomplete_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_custom_fields_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_history: {
        Row: {
          changed_by: string
          created_at: string
          event_type: string
          from_value: string | null
          id: string
          order_id: string
          to_value: string | null
        }
        Insert: {
          changed_by?: string
          created_at?: string
          event_type: string
          from_value?: string | null
          id?: string
          order_id: string
          to_value?: string | null
        }
        Update: {
          changed_by?: string
          created_at?: string
          event_type?: string
          from_value?: string | null
          id?: string
          order_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "incomplete_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "incomplete_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_sources: {
        Row: {
          created_at: string
          id: string
          name: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          visible?: boolean
        }
        Relationships: []
      }
      orders: {
        Row: {
          advance_amount: number
          advance_source_id: string | null
          advance_txn_id: string | null
          consignment_id: string | null
          courier_id: string | null
          created_at: string
          created_by: string | null
          cross_sale: boolean
          customer_address: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          customer_type: string
          delivery_charge: number
          delivery_method: string | null
          discount_amount: number
          external_order_id: string | null
          forwarded_to_partner_at: string | null
          id: string
          internal_note: string | null
          invoice_note: string | null
          invoice_number: string | null
          is_paid_marketing: boolean
          oms_sender_name: string | null
          oms_sender_order_no: string | null
          order_number: number
          order_source_id: string | null
          phone_key8: string | null
          phone_normalized: string | null
          preorder: boolean
          preorder_date: string | null
          source: string
          source_site_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total_amount: number
          tracking_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          advance_amount?: number
          advance_source_id?: string | null
          advance_txn_id?: string | null
          consignment_id?: string | null
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          cross_sale?: boolean
          customer_address: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          customer_type?: string
          delivery_charge?: number
          delivery_method?: string | null
          discount_amount?: number
          external_order_id?: string | null
          forwarded_to_partner_at?: string | null
          id?: string
          internal_note?: string | null
          invoice_note?: string | null
          invoice_number?: string | null
          is_paid_marketing?: boolean
          oms_sender_name?: string | null
          oms_sender_order_no?: string | null
          order_number?: number
          order_source_id?: string | null
          phone_key8?: string | null
          phone_normalized?: string | null
          preorder?: boolean
          preorder_date?: string | null
          source?: string
          source_site_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total_amount?: number
          tracking_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          advance_amount?: number
          advance_source_id?: string | null
          advance_txn_id?: string | null
          consignment_id?: string | null
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          cross_sale?: boolean
          customer_address?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          customer_type?: string
          delivery_charge?: number
          delivery_method?: string | null
          discount_amount?: number
          external_order_id?: string | null
          forwarded_to_partner_at?: string | null
          id?: string
          internal_note?: string | null
          invoice_note?: string | null
          invoice_number?: string | null
          is_paid_marketing?: boolean
          oms_sender_name?: string | null
          oms_sender_order_no?: string | null
          order_number?: number
          order_source_id?: string | null
          phone_key8?: string | null
          phone_normalized?: string | null
          preorder?: boolean
          preorder_date?: string | null
          source?: string
          source_site_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total_amount?: number
          tracking_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_advance_source_id_fkey"
            columns: ["advance_source_id"]
            isOneToOne: false
            referencedRelation: "advance_payment_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_order_source_id_fkey"
            columns: ["order_source_id"]
            isOneToOne: false
            referencedRelation: "order_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_source_site_id_fkey"
            columns: ["source_site_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_user_invites: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          email_normalized: string | null
          full_name: string | null
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          email_normalized?: string | null
          full_name?: string | null
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          email_normalized?: string | null
          full_name?: string | null
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          used_at?: string | null
        }
        Relationships: []
      }
      product_external_refs: {
        Row: {
          created_at: string
          external_product_id: string
          external_variant_id: string
          id: string
          product_id: string
          source: string
          source_site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_product_id: string
          external_variant_id?: string
          id?: string
          product_id: string
          source?: string
          source_site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_product_id?: string
          external_variant_id?: string
          id?: string
          product_id?: string
          source?: string
          source_site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_external_refs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_external_refs_source_site_id_fkey"
            columns: ["source_site_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_mother_links: {
        Row: {
          consume_quantity: number
          created_at: string
          id: string
          mother_product_id: string
          sub_product_id: string
          sub_variant_id: string | null
          updated_at: string
        }
        Insert: {
          consume_quantity: number
          created_at?: string
          id?: string
          mother_product_id: string
          sub_product_id: string
          sub_variant_id?: string | null
          updated_at?: string
        }
        Update: {
          consume_quantity?: number
          created_at?: string
          id?: string
          mother_product_id?: string
          sub_product_id?: string
          sub_variant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_mother_links_mother_product_id_fkey"
            columns: ["mother_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_mother_links_sub_product_id_fkey"
            columns: ["sub_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_mother_links_sub_variant_id_fkey"
            columns: ["sub_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          cost_price: number
          created_at: string
          id: string
          image_url: string | null
          price: number | null
          product_id: string
          sku: string | null
          status: Database["public"]["Enums"]["entity_status"]
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          attributes?: Json
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          price?: number | null
          product_id: string
          sku?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          attributes?: Json
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          price?: number | null
          product_id?: string
          sku?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          has_variants: boolean
          id: string
          image_url: string | null
          is_featured: boolean
          is_mother_product: boolean
          low_stock_threshold: number
          mother_unit: string | null
          name: string
          price: number
          sku: string | null
          status: Database["public"]["Enums"]["entity_status"]
          stock_quantity: number
          updated_at: string
          use_variant_pricing: boolean
          variant_attributes: Json
        }
        Insert: {
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_featured?: boolean
          is_mother_product?: boolean
          low_stock_threshold?: number
          mother_unit?: string | null
          name: string
          price?: number
          sku?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          stock_quantity?: number
          updated_at?: string
          use_variant_pricing?: boolean
          variant_attributes?: Json
        }
        Update: {
          category_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_featured?: boolean
          is_mother_product?: boolean
          low_stock_threshold?: number
          mother_unit?: string | null
          name?: string
          price?: number
          sku?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          stock_quantity?: number
          updated_at?: string
          use_variant_pricing?: boolean
          variant_attributes?: Json
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
          avatar_url: string | null
          chat_force_popup: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          inactivity_lock_enabled: boolean
          inactivity_lock_seconds: number
          is_blocked: boolean
          last_seen_at: string | null
          screen_locked_at: string | null
          screen_locked_by: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          chat_force_popup?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          inactivity_lock_enabled?: boolean
          inactivity_lock_seconds?: number
          is_blocked?: boolean
          last_seen_at?: string | null
          screen_locked_at?: string | null
          screen_locked_by?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          chat_force_popup?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          inactivity_lock_enabled?: boolean
          inactivity_lock_seconds?: number
          is_blocked?: boolean
          last_seen_at?: string | null
          screen_locked_at?: string | null
          screen_locked_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          message: string
          order_id: string | null
          phone: string
          provider_response: Json | null
          sent_by: string | null
          status: string
          trigger: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          message: string
          order_id?: string | null
          phone: string
          provider_response?: Json | null
          sent_by?: string | null
          status?: string
          trigger?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          message?: string
          order_id?: string | null
          phone?: string
          provider_response?: Json | null
          sent_by?: string | null
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      sms_settings: {
        Row: {
          api_key: string | null
          api_url: string | null
          enabled: boolean
          enabled_confirmed: boolean
          enabled_shipped: boolean
          enabled_web_order: boolean
          id: boolean
          sender_id: string | null
          template_bulk_default: string
          template_confirmed: string
          template_shipped: string
          template_single_default: string
          template_web_order: string
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          api_url?: string | null
          enabled?: boolean
          enabled_confirmed?: boolean
          enabled_shipped?: boolean
          enabled_web_order?: boolean
          id?: boolean
          sender_id?: string | null
          template_bulk_default?: string
          template_confirmed?: string
          template_shipped?: string
          template_single_default?: string
          template_web_order?: string
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          api_url?: string | null
          enabled?: boolean
          enabled_confirmed?: boolean
          enabled_shipped?: boolean
          enabled_web_order?: boolean
          id?: boolean
          sender_id?: string | null
          template_bulk_default?: string
          template_confirmed?: string
          template_shipped?: string
          template_single_default?: string
          template_web_order?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_sessions: {
        Row: {
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          last_seen_at: string
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          last_seen_at?: string
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          last_seen_at?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          method: string | null
          note: string | null
          paid_on: string
          purchase_id: string | null
          supplier_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          note?: string | null
          paid_on?: string
          purchase_id?: string | null
          supplier_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          note?: string | null
          paid_on?: string
          purchase_id?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_id: string
          quantity: number
          total_cost: number
          unit_cost: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_id: string
          quantity: number
          total_cost?: number
          unit_cost?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_id?: string
          quantity?: number
          total_cost?: number
          unit_cost?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchases: {
        Row: {
          created_at: string
          created_by: string | null
          discount: number
          due_amount: number
          id: string
          note: string | null
          paid_amount: number
          purchase_date: string
          purchase_number: string | null
          status: string
          subtotal: number
          supplier_id: string
          total_amount: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount?: number
          due_amount?: number
          id?: string
          note?: string | null
          paid_amount?: number
          purchase_date?: string
          purchase_number?: string | null
          status?: string
          subtotal?: number
          supplier_id: string
          total_amount?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount?: number
          due_amount?: number
          id?: string
          note?: string | null
          paid_amount?: number
          purchase_date?: string
          purchase_number?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string
          total_amount?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchases_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_returns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          purchase_id: string | null
          quantity: number
          reason: string | null
          return_date: string
          supplier_id: string
          unit_cost: number
          variant_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          purchase_id?: string | null
          quantity: number
          reason?: string | null
          return_date?: string
          supplier_id: string
          unit_cost?: number
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          purchase_id?: string | null
          quantity?: number
          reason?: string | null
          return_date?: string
          supplier_id?: string
          unit_cost?: number
          variant_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          note: string | null
          opening_balance: number
          phone: string | null
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          note?: string | null
          opening_balance?: number
          phone?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          note?: string | null
          opening_balance?: number
          phone?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      task_history: {
        Row: {
          changed_by: string | null
          created_at: string
          event_type: string
          from_value: string | null
          id: string
          note: string | null
          task_id: string
          to_value: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          event_type: string
          from_value?: string | null
          id?: string
          note?: string | null
          task_id: string
          to_value?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          event_type?: string
          from_value?: string | null
          id?: string
          note?: string | null
          task_id?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string
          assigned_to: string
          completed_at: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          customer_source: string | null
          description: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by: string
          assigned_to: string
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          customer_source?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          assigned_to?: string
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          customer_source?: string | null
          description?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      telesales_assignments: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          last_action: Database["public"]["Enums"]["telesales_action"] | null
          last_contacted_at: string | null
          note: string | null
          order_id: string | null
          order_taken_at: string | null
          status: Database["public"]["Enums"]["telesales_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          last_action?: Database["public"]["Enums"]["telesales_action"] | null
          last_contacted_at?: string | null
          note?: string | null
          order_id?: string | null
          order_taken_at?: string | null
          status?: Database["public"]["Enums"]["telesales_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          last_action?: Database["public"]["Enums"]["telesales_action"] | null
          last_contacted_at?: string | null
          note?: string | null
          order_id?: string | null
          order_taken_at?: string | null
          status?: Database["public"]["Enums"]["telesales_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telesales_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "incomplete_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telesales_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      telesales_call_logs: {
        Row: {
          action: Database["public"]["Enums"]["telesales_action"] | null
          assignment_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          reassigned_to: string | null
          status_to: Database["public"]["Enums"]["telesales_status"] | null
        }
        Insert: {
          action?: Database["public"]["Enums"]["telesales_action"] | null
          assignment_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reassigned_to?: string | null
          status_to?: Database["public"]["Enums"]["telesales_status"] | null
        }
        Update: {
          action?: Database["public"]["Enums"]["telesales_action"] | null
          assignment_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reassigned_to?: string | null
          status_to?: Database["public"]["Enums"]["telesales_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "telesales_call_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "telesales_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      telesales_compensation: {
        Row: {
          base_amount: number
          created_at: string
          enabled: boolean
          frequency: string
          id: string
          per_order_amount: number
          per_order_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_amount?: number
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          per_order_amount?: number
          per_order_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          base_amount?: number
          created_at?: string
          enabled?: boolean
          frequency?: string
          id?: string
          per_order_amount?: number
          per_order_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_limits: {
        Row: {
          created_at: string
          max_users_can_create: number | null
          messages_per_month: number | null
          notes: string | null
          oms_orders_per_month: number | null
          updated_at: string
          user_id: string
          woo_orders_per_month: number | null
        }
        Insert: {
          created_at?: string
          max_users_can_create?: number | null
          messages_per_month?: number | null
          notes?: string | null
          oms_orders_per_month?: number | null
          updated_at?: string
          user_id: string
          woo_orders_per_month?: number | null
        }
        Update: {
          created_at?: string
          max_users_can_create?: number | null
          messages_per_month?: number | null
          notes?: string | null
          oms_orders_per_month?: number | null
          updated_at?: string
          user_id?: string
          woo_orders_per_month?: number | null
        }
        Relationships: []
      }
      user_oms_access: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          sender_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          sender_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          sender_name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_access_settings: boolean
          can_change_order_status: boolean
          can_create_users: boolean
          can_delete: boolean
          can_export_data: boolean
          can_forward_orders: boolean
          can_import_data: boolean
          can_manage_courier_api: boolean
          can_manage_couriers: boolean
          can_manage_db_setup: boolean
          can_manage_inactivity_lock: boolean
          can_manage_invoice_settings: boolean
          can_manage_marketing: boolean
          can_manage_messaging: boolean
          can_manage_notices: boolean
          can_manage_oms_endpoints: boolean
          can_manage_orders: boolean
          can_manage_passwords: boolean
          can_manage_products: boolean
          can_manage_telesales: boolean
          can_manage_users: boolean
          can_view_all_orders: boolean
          can_view_dashboard: boolean
          can_view_loss: boolean
          can_view_orders: boolean
          can_view_profit: boolean
          can_view_reports: boolean
          can_view_staff_report: boolean
          can_view_telesales_reports: boolean
          can_view_web_orders: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          can_access_settings?: boolean
          can_change_order_status?: boolean
          can_create_users?: boolean
          can_delete?: boolean
          can_export_data?: boolean
          can_forward_orders?: boolean
          can_import_data?: boolean
          can_manage_courier_api?: boolean
          can_manage_couriers?: boolean
          can_manage_db_setup?: boolean
          can_manage_inactivity_lock?: boolean
          can_manage_invoice_settings?: boolean
          can_manage_marketing?: boolean
          can_manage_messaging?: boolean
          can_manage_notices?: boolean
          can_manage_oms_endpoints?: boolean
          can_manage_orders?: boolean
          can_manage_passwords?: boolean
          can_manage_products?: boolean
          can_manage_telesales?: boolean
          can_manage_users?: boolean
          can_view_all_orders?: boolean
          can_view_dashboard?: boolean
          can_view_loss?: boolean
          can_view_orders?: boolean
          can_view_profit?: boolean
          can_view_reports?: boolean
          can_view_staff_report?: boolean
          can_view_telesales_reports?: boolean
          can_view_web_orders?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          can_access_settings?: boolean
          can_change_order_status?: boolean
          can_create_users?: boolean
          can_delete?: boolean
          can_export_data?: boolean
          can_forward_orders?: boolean
          can_import_data?: boolean
          can_manage_courier_api?: boolean
          can_manage_couriers?: boolean
          can_manage_db_setup?: boolean
          can_manage_inactivity_lock?: boolean
          can_manage_invoice_settings?: boolean
          can_manage_marketing?: boolean
          can_manage_messaging?: boolean
          can_manage_notices?: boolean
          can_manage_oms_endpoints?: boolean
          can_manage_orders?: boolean
          can_manage_passwords?: boolean
          can_manage_products?: boolean
          can_manage_telesales?: boolean
          can_manage_users?: boolean
          can_view_all_orders?: boolean
          can_view_dashboard?: boolean
          can_view_loss?: boolean
          can_view_orders?: boolean
          can_view_profit?: boolean
          can_view_reports?: boolean
          can_view_staff_report?: boolean
          can_view_telesales_reports?: boolean
          can_view_web_orders?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          order_template_desktop: string | null
          order_template_mobile: string | null
          tele_template_desktop: string | null
          tele_template_mobile: string | null
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          order_template_desktop?: string | null
          order_template_mobile?: string | null
          tele_template_desktop?: string | null
          tele_template_mobile?: string | null
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          order_template_desktop?: string | null
          order_template_mobile?: string | null
          tele_template_desktop?: string | null
          tele_template_mobile?: string | null
          theme?: string
          updated_at?: string
          user_id?: string
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
      user_site_access: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          site_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          site_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_site_access_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          location: string | null
          name: string
          status: Database["public"]["Enums"]["entity_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          location?: string | null
          name: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          location?: string | null
          name?: string
          status?: Database["public"]["Enums"]["entity_status"]
          updated_at?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          action: string | null
          created_at: string
          error: string | null
          external_id: string | null
          http_status: number
          id: string
          payload: Json | null
          provider: string
          status: string
        }
        Insert: {
          action?: string | null
          created_at?: string
          error?: string | null
          external_id?: string | null
          http_status: number
          id?: string
          payload?: Json | null
          provider: string
          status: string
        }
        Update: {
          action?: string | null
          created_at?: string
          error?: string | null
          external_id?: string | null
          http_status?: number
          id?: string
          payload?: Json | null
          provider?: string
          status?: string
        }
        Relationships: []
      }
      whatsapp_logs: {
        Row: {
          batch_id: string | null
          created_at: string
          customer_name: string | null
          error: string | null
          id: string
          message: string
          phone: string
          provider_response: Json | null
          sent_by: string | null
          status: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          customer_name?: string | null
          error?: string | null
          id?: string
          message: string
          phone: string
          provider_response?: Json | null
          sent_by?: string | null
          status?: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          customer_name?: string | null
          error?: string | null
          id?: string
          message?: string
          phone?: string
          provider_response?: Json | null
          sent_by?: string | null
          status?: string
        }
        Relationships: []
      }
      whatsapp_settings: {
        Row: {
          api_token: string | null
          api_url: string | null
          enabled: boolean
          id: boolean
          phone_number_id: string | null
          sender_name: string | null
          updated_at: string
        }
        Insert: {
          api_token?: string | null
          api_url?: string | null
          enabled?: boolean
          id?: boolean
          phone_number_id?: string | null
          sender_name?: string | null
          updated_at?: string
        }
        Update: {
          api_token?: string | null
          api_url?: string | null
          enabled?: boolean
          id?: boolean
          phone_number_id?: string | null
          sender_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wp_incomplete_sync_logs: {
        Row: {
          created: number
          created_at: string
          error: string | null
          failed: number
          fetched: number
          id: string
          imported_ids: Json
          integration_id: string | null
          marked_imported: number
          site_name: string | null
          skipped_dup: number
          skipped_no_phone: number
        }
        Insert: {
          created?: number
          created_at?: string
          error?: string | null
          failed?: number
          fetched?: number
          id?: string
          imported_ids?: Json
          integration_id?: string | null
          marked_imported?: number
          site_name?: string | null
          skipped_dup?: number
          skipped_no_phone?: number
        }
        Update: {
          created?: number
          created_at?: string
          error?: string | null
          failed?: number
          fetched?: number
          id?: string
          imported_ids?: Json
          integration_id?: string | null
          marked_imported?: number
          site_name?: string | null
          skipped_dup?: number
          skipped_no_phone?: number
        }
        Relationships: []
      }
    }
    Views: {
      customer_stats: {
        Row: {
          address: string | null
          cancelled_orders: number | null
          completed_orders: number | null
          email: string | null
          first_order_at: string | null
          is_wholesale: boolean | null
          last_order_at: string | null
          name: string | null
          phone: string | null
          total_orders: number | null
          total_spent: number | null
        }
        Relationships: []
      }
      incomplete_orders: {
        Row: {
          advance_amount: number | null
          advance_source_id: string | null
          advance_txn_id: string | null
          consignment_id: string | null
          courier_id: string | null
          created_at: string | null
          created_by: string | null
          cross_sale: boolean | null
          customer_address: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          delivery_charge: number | null
          delivery_method: string | null
          discount_amount: number | null
          external_order_id: string | null
          id: string | null
          internal_note: string | null
          invoice_note: string | null
          invoice_number: string | null
          is_paid_marketing: boolean | null
          missing_fields: string[] | null
          order_number: number | null
          order_source_id: string | null
          phone_normalized: string | null
          preorder: boolean | null
          preorder_date: string | null
          source: string | null
          source_site_id: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          subtotal: number | null
          total_amount: number | null
          tracking_url: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_advance_source_id_fkey"
            columns: ["advance_source_id"]
            isOneToOne: false
            referencedRelation: "advance_payment_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_order_source_id_fkey"
            columns: ["order_source_id"]
            isOneToOne: false
            referencedRelation: "order_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_source_site_id_fkey"
            columns: ["source_site_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_limits_with_usage: {
        Row: {
          email: string | null
          max_users_can_create: number | null
          messages_per_month: number | null
          messages_used: number | null
          notes: string | null
          oms_orders_per_month: number | null
          oms_orders_used: number | null
          updated_at: string | null
          user_id: string | null
          users_created: number | null
          woo_orders_per_month: number | null
          woo_orders_used: number | null
        }
        Relationships: []
      }
      user_usage_current_month: {
        Row: {
          messages_used: number | null
          oms_orders_used: number | null
          user_id: string | null
          users_created: number | null
          woo_orders_used: number | null
        }
        Insert: {
          messages_used?: never
          oms_orders_used?: never
          user_id?: string | null
          users_created?: never
          woo_orders_used?: never
        }
        Update: {
          messages_used?: never
          oms_orders_used?: never
          user_id?: string | null
          users_created?: never
          woo_orders_used?: never
        }
        Relationships: []
      }
    }
    Functions: {
      admin_lock_user_screen: { Args: { target: string }; Returns: undefined }
      bulk_update_order_status: {
        Args: {
          p_ids: string[]
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: number
      }
      can_view_all_orders: { Args: { _uid: string }; Returns: boolean }
      check_user_limit: {
        Args: { _type: string; _user_id: string }
        Returns: boolean
      }
      claim_pending_user_invite: { Args: never; Returns: boolean }
      cleanup_old_facebook_webhook_logs: { Args: never; Returns: undefined }
      cleanup_old_sms_logs: { Args: never; Returns: undefined }
      cleanup_old_telesales_call_logs: { Args: never; Returns: undefined }
      cleanup_old_webhook_logs: { Args: never; Returns: undefined }
      cleanup_old_whatsapp_logs: { Args: never; Returns: undefined }
      cleanup_old_wp_incomplete_sync_logs: { Args: never; Returns: undefined }
      clear_telesales_assignments: {
        Args: { _staff?: string }
        Returns: number
      }
      close_stale_staff_sessions: { Args: never; Returns: number }
      count_orders_by_phone: {
        Args: { p_exclude_id?: string; p_phone: string }
        Returns: number
      }
      create_order_with_items: {
        Args: {
          p_advance_amount: number
          p_courier_id: string
          p_customer_address: string
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_delivery_charge: number
          p_discount_amount: number
          p_internal_note: string
          p_invoice_note: string
          p_items: Json
          p_subtotal: number
          p_total_amount: number
        }
        Returns: {
          advance_amount: number
          advance_source_id: string | null
          advance_txn_id: string | null
          consignment_id: string | null
          courier_id: string | null
          created_at: string
          created_by: string | null
          cross_sale: boolean
          customer_address: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          customer_type: string
          delivery_charge: number
          delivery_method: string | null
          discount_amount: number
          external_order_id: string | null
          forwarded_to_partner_at: string | null
          id: string
          internal_note: string | null
          invoice_note: string | null
          invoice_number: string | null
          is_paid_marketing: boolean
          oms_sender_name: string | null
          oms_sender_order_no: string | null
          order_number: number
          order_source_id: string | null
          phone_key8: string | null
          phone_normalized: string | null
          preorder: boolean
          preorder_date: string | null
          source: string
          source_site_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total_amount: number
          tracking_url: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_supplier_purchase:
        | {
            Args: {
              p_discount: number
              p_items: Json
              p_paid_amount: number
              p_supplier_id: string
              p_warehouse_id: string
            }
            Returns: {
              created_at: string
              created_by: string | null
              discount: number
              due_amount: number
              id: string
              note: string | null
              paid_amount: number
              purchase_date: string
              purchase_number: string | null
              status: string
              subtotal: number
              supplier_id: string
              total_amount: number
              updated_at: string
              warehouse_id: string | null
            }
            SetofOptions: {
              from: "*"
              to: "supplier_purchases"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_discount: number
              p_items: Json
              p_note: string
              p_paid_amount: number
              p_purchase_date: string
              p_supplier_id: string
              p_warehouse_id: string
            }
            Returns: {
              created_at: string
              created_by: string | null
              discount: number
              due_amount: number
              id: string
              note: string | null
              paid_amount: number
              purchase_date: string
              purchase_number: string | null
              status: string
              subtotal: number
              supplier_id: string
              total_amount: number
              updated_at: string
              warehouse_id: string | null
            }
            SetofOptions: {
              from: "*"
              to: "supplier_purchases"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      get_bdcourier_api_key: { Args: never; Returns: string }
      get_courier_credential_by_id: {
        Args: { p_courier_id: string }
        Returns: {
          api_key: string
          base_url: string
          id: string
          name: string
          secret_key: string
        }[]
      }
      get_courier_credentials: {
        Args: never
        Returns: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          is_default: boolean
          kind: string
          logo_url: string
          name: string
          provider: string
          secret_key: string
          status: string
        }[]
      }
      get_dashboard_bundle: {
        Args: {
          p_last_month_from: string
          p_last_month_to: string
          p_main_from: string
          p_main_to: string
          p_repeat_from?: string
          p_repeat_to?: string
          p_summary_from: string
          p_summary_to: string
          p_this_month_from: string
          p_this_month_to: string
          p_today_from: string
          p_today_to: string
          p_week_from: string
          p_week_to: string
          p_yesterday_from: string
          p_yesterday_to: string
        }
        Returns: Json
      }
      get_dashboard_minimal: {
        Args: {
          p_main_from: string
          p_main_to: string
          p_this_month_from: string
          p_this_month_to: string
          p_today_from: string
          p_today_to: string
        }
        Returns: Json
      }
      get_duplicate_active_phones_array: { Args: never; Returns: Json }
      get_duplicate_active_phones_v2: {
        Args: never
        Returns: {
          customer_email: string
          phone_key: string
          phone_normalized: string
        }[]
      }
      get_expense_overview: { Args: never; Returns: Json }
      get_facebook_settings_admin: {
        Args: never
        Returns: {
          access_token: string | null
          app_id: string | null
          app_secret: string | null
          enabled: boolean
          id: boolean
          updated_at: string
          verify_token: string | null
          webhook_secret: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "facebook_settings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_mother_products_report: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      get_order_customer_flags_v1: {
        Args: { p_emails?: string[]; p_phones?: string[] }
        Returns: Json
      }
      get_order_tab_counts:
        | {
            Args: {
              p_courier?: string
              p_from?: string
              p_phones?: string[]
              p_search?: string
              p_source?: string
              p_to?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_advance_only?: boolean
              p_courier?: string
              p_from?: string
              p_phones?: string[]
              p_search?: string
              p_source?: string
              p_to?: string
            }
            Returns: Json
          }
      get_order_tab_counts_v2: {
        Args: {
          p_advance_only?: boolean
          p_allowed_oms?: string[]
          p_courier?: string
          p_from?: string
          p_oms_restricted?: boolean
          p_partner?: string
          p_phones?: string[]
          p_search?: string
          p_site?: string
          p_source?: string
          p_staff?: string
          p_to?: string
        }
        Returns: Json
      }
      get_profit_loss: { Args: { p_from: string; p_to: string }; Returns: Json }
      get_repeat_phones_array: { Args: never; Returns: string[] }
      get_repeat_phones_v2: {
        Args: never
        Returns: {
          phone_key: string
        }[]
      }
      get_reports_bundle: {
        Args: {
          p_from: string
          p_from_date: string
          p_source?: string
          p_to: string
          p_to_date: string
        }
        Returns: Json
      }
      get_user_display_names: {
        Args: { p_ids: string[] }
        Returns: {
          display_name: string
          id: string
        }[]
      }
      get_whatsapp_settings_admin: {
        Args: never
        Returns: {
          api_token: string | null
          api_url: string | null
          enabled: boolean
          id: boolean
          phone_number_id: string | null
          sender_name: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_settings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat: { Args: never; Returns: undefined }
      import_legacy_order: {
        Args: {
          p_customer_address: string
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_delivery_charge: number
          p_items: Json
          p_order_date: string
          p_status: Database["public"]["Enums"]["order_status"]
          p_subtotal: number
          p_total_amount: number
        }
        Returns: string
      }
      import_legacy_orders_batch: {
        Args: { p_orders: Json }
        Returns: {
          errors: Json
          failed: number
          inserted: number
        }[]
      }
      is_main_admin: { Args: { _user_id: string }; Returns: boolean }
      is_phone_blocked: {
        Args: { p_phone: string }
        Returns: {
          blocked: boolean
          blocked_at: string
          blocked_by: string
          reason: string
        }[]
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      list_assignable_users: {
        Args: never
        Returns: {
          display_name: string
          email: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      next_unique_order_number: { Args: never; Returns: number }
      normalize_phone: { Args: { p_phone: string }; Returns: string }
      search_task_customers: {
        Args: { p_query: string }
        Returns: {
          name: string
          phone: string
          source: string
        }[]
      }
      task_assignment_stats: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_completion_seconds: number
          completed: number
          display_name: string
          on_hold: number
          pending: number
          total: number
          user_id: string
        }[]
      }
      unlock_my_screen: { Args: never; Returns: undefined }
      update_order_with_items: {
        Args: {
          p_advance_amount: number
          p_customer_address: string
          p_customer_name: string
          p_customer_phone: string
          p_delivery_charge: number
          p_discount_amount: number
          p_internal_note: string
          p_invoice_note: string
          p_items: Json
          p_order_id: string
        }
        Returns: {
          advance_amount: number
          advance_source_id: string | null
          advance_txn_id: string | null
          consignment_id: string | null
          courier_id: string | null
          created_at: string
          created_by: string | null
          cross_sale: boolean
          customer_address: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          customer_type: string
          delivery_charge: number
          delivery_method: string | null
          discount_amount: number
          external_order_id: string | null
          forwarded_to_partner_at: string | null
          id: string
          internal_note: string | null
          invoice_note: string | null
          invoice_number: string | null
          is_paid_marketing: boolean
          oms_sender_name: string | null
          oms_sender_order_no: string | null
          order_number: number
          order_source_id: string | null
          phone_key8: string | null
          phone_normalized: string | null
          preorder: boolean
          preorder_date: string | null
          source: string
          source_site_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total_amount: number
          tracking_url: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_woo_order_with_items:
        | {
            Args: {
              p_customer_address: string
              p_customer_email: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery: number
              p_discount: number
              p_external_id: string
              p_internal_note_create: string
              p_internal_note_update: string
              p_invoice_note: string
              p_items: Json
              p_order_source_id: string
              p_source_site_id: string
              p_subtotal: number
              p_total: number
            }
            Returns: {
              action: string
              order_id: string
            }[]
          }
        | {
            Args: {
              p_customer_address: string
              p_customer_email: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery: number
              p_discount: number
              p_external_id: string
              p_internal_note_create: string
              p_internal_note_update: string
              p_invoice_note: string
              p_items: Json
              p_order_source_id: string
              p_source_site_id: string
              p_status?: Database["public"]["Enums"]["order_status"]
              p_subtotal: number
              p_total: number
            }
            Returns: {
              action: string
              order_id: string
            }[]
          }
      user_has_any_permission: {
        Args: { _perms: string[]; _user_id: string }
        Returns: boolean
      }
      user_has_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "staff"
        | "user_request"
        | "business_owner"
      complaint_category:
        | "damage"
        | "wrong_item"
        | "missing_item"
        | "late_delivery"
        | "refund_pending"
        | "quality"
        | "behavior"
        | "other"
      complaint_severity: "low" | "medium" | "high"
      complaint_status: "open" | "in_progress" | "resolved" | "dismissed"
      customer_tag:
        | "new_customer"
        | "interested"
        | "vip"
        | "silver"
        | "gold"
        | "premium"
        | "retail"
        | "wholesale"
      entity_status: "active" | "inactive"
      expense_frequency:
        | "one_time"
        | "daily"
        | "weekly"
        | "monthly"
        | "yearly"
        | "per_order"
      order_status:
        | "processing"
        | "ready_to_ship"
        | "shipped"
        | "completed"
        | "cancelled"
        | "returned"
        | "pending_web"
        | "no_response"
        | "fraud"
        | "hold"
        | "cancel_request"
        | "pending"
        | "ready_order"
        | "incomplete"
        | "out_of_stock"
      task_status: "pending" | "on_hold" | "completed"
      telesales_action:
        | "phone_off"
        | "not_received"
        | "will_take_later"
        | "fraud"
        | "call_back_later"
      telesales_status: "pending" | "complete" | "hold"
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
      app_role: ["admin", "manager", "staff", "user_request", "business_owner"],
      complaint_category: [
        "damage",
        "wrong_item",
        "missing_item",
        "late_delivery",
        "refund_pending",
        "quality",
        "behavior",
        "other",
      ],
      complaint_severity: ["low", "medium", "high"],
      complaint_status: ["open", "in_progress", "resolved", "dismissed"],
      customer_tag: [
        "new_customer",
        "interested",
        "vip",
        "silver",
        "gold",
        "premium",
        "retail",
        "wholesale",
      ],
      entity_status: ["active", "inactive"],
      expense_frequency: [
        "one_time",
        "daily",
        "weekly",
        "monthly",
        "yearly",
        "per_order",
      ],
      order_status: [
        "processing",
        "ready_to_ship",
        "shipped",
        "completed",
        "cancelled",
        "returned",
        "pending_web",
        "no_response",
        "fraud",
        "hold",
        "cancel_request",
        "pending",
        "ready_order",
        "incomplete",
        "out_of_stock",
      ],
      task_status: ["pending", "on_hold", "completed"],
      telesales_action: [
        "phone_off",
        "not_received",
        "will_take_later",
        "fraud",
        "call_back_later",
      ],
      telesales_status: ["pending", "complete", "hold"],
    },
  },
} as const
