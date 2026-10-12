export function toSeatInfo(usage) {
  if (!usage?.data) return null;
  return {
    purchasedSeats: usage.data.purchasedSeats ?? 1,
    tier: usage.data.tier ?? 'FREE',
    hasSubscription: usage.data.hasSubscription ?? false,
  };
}
