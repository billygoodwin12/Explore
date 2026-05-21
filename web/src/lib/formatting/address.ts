export function shortenAddress(address: string, chars = 4): string {
  if (!address || address.length < 2 + chars * 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function shortenHash(hash: string, chars = 6): string {
  if (!hash || hash.length < 2 + chars * 2) return hash;
  return `${hash.slice(0, 2 + chars)}…${hash.slice(-chars)}`;
}
