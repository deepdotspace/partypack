/**
 * Subscription plan declarations.
 *
 * Edit this file then `deepspace deploy` to sync the plans to Stripe Products
 * and Prices. Keep `slug` stable — subscribers and tier checks refer to it.
 *
 * Minimum prices: $3/month, $12/year — below this Stripe's per-transaction
 * fee ($0.30 + 2.9%) eats most of the charge, so the developer would receive
 * almost nothing per payout. Free plans don't hit Stripe at all.
 */

// Party Pack is free to play — no plans. (Add rows here + redeploy to sell tiers.)
export const subscriptionPlans = [] as const

export type SubscriptionPlanSlug = (typeof subscriptionPlans)[number] extends never
  ? string
  : (typeof subscriptionPlans)[number]['slug']
