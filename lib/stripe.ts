import { Stripe } from "stripe"

import { env } from "@/env.mjs"

export const stripe = new Stripe(env.STRIPE_API_KEY, {
  apiVersion: "2024-11-20.acacia",
  typescript: true,
})
