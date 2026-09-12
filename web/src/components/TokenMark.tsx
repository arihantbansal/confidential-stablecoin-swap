import { useState } from "react";
import type { LocalAsset } from "@/lib/manifest";
import { getTokenIcon } from "@/lib/token-icons";

interface TokenMarkProps {
  asset: LocalAsset;
  large?: boolean;
}

function TokenMarkInner({
  asset,
  large = false,
  imageUrl,
}: TokenMarkProps & { imageUrl: string }) {
  const [failed, setFailed] = useState(false);
  const size = large ? "size-9" : "size-5";

  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ${large ? "text-xs" : "text-[10px]"}`}
      >
        {asset.symbol.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      key={imageUrl}
      src={imageUrl}
      alt=""
      className={`${size} shrink-0 rounded-full object-cover outline outline-1 outline-black/10 dark:outline-white/10`}
      onError={() => setFailed(true)}
    />
  );
}

export function TokenMark({ asset, large = false }: TokenMarkProps) {
  const token = getTokenIcon(asset.mint);
  const size = large ? "size-9" : "size-5";
  if (!token) {
    return (
      <span
        aria-hidden="true"
        className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ${large ? "text-xs" : "text-[10px]"}`}
      >
        {asset.symbol.slice(0, 1)}
      </span>
    );
  }
  // Key by mint + image URL so fallback state resets when the asset changes.
  const resetKey = `${asset.mint.toString()}:${token.imageUrl}`;
  return (
    <TokenMarkInner
      key={resetKey}
      asset={asset}
      large={large}
      imageUrl={token.imageUrl}
    />
  );
}
