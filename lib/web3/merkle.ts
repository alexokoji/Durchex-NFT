import { concat, encodePacked, keccak256 } from "viem";

export function addressLeaf(address: string) {
  return keccak256(encodePacked(["address"], [address.toLowerCase() as `0x${string}`]));
}

function parent(left: `0x${string}`, right: `0x${string}`) {
  return keccak256(concat([left < right ? left : right, left < right ? right : left]));
}

export function merkleRoot(addresses: string[]) {
  let layer = [...new Set(addresses.map((address) => address.toLowerCase()))].map(addressLeaf).sort();
  if (layer.length === 0) return null;
  while (layer.length > 1) {
    const next: `0x${string}`[] = [];
    for (let index = 0; index < layer.length; index += 2) next.push(index + 1 < layer.length ? parent(layer[index], layer[index + 1]) : layer[index]);
    layer = next;
  }
  return layer[0];
}

export function merkleProof(addresses: string[], address: string) {
  const leaf = addressLeaf(address);
  let layer = [...new Set(addresses.map((value) => value.toLowerCase()))].map(addressLeaf).sort();
  if (!layer.includes(leaf)) return [];
  const proof: `0x${string}`[] = [];
  let index = layer.indexOf(leaf);
  while (layer.length > 1) {
    const sibling = index % 2 ? index - 1 : index + 1;
    if (sibling < layer.length) proof.push(layer[sibling]);
    const next: `0x${string}`[] = [];
    for (let cursor = 0; cursor < layer.length; cursor += 2) next.push(cursor + 1 < layer.length ? parent(layer[cursor], layer[cursor + 1]) : layer[cursor]);
    index = Math.floor(index / 2);
    layer = next;
  }
  return proof;
}
