import { useEffect, useState } from 'react';
import { getPhoto, isStoredPhotoRef, photoRefId } from '../lib/photoStore';

// Every place a photoUrls entry gets rendered goes through this instead of
// a bare <img src={url}> — a stored-photo reference (see photoStore.ts)
// isn't a URL an <img> can use directly; it names a Blob sitting in
// IndexedDB, which has to be resolved to a real object URL first. A plain
// data URI or relative path (the two formats photoUrls has always
// supported) renders exactly as before — this component is a pure
// addition, not a change to that existing behavior.
export default function TankPhoto({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(
    isStoredPhotoRef(src) ? null : src
  );

  useEffect(() => {
    if (!isStoredPhotoRef(src)) {
      setResolvedSrc(src);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setResolvedSrc(null);
    getPhoto(photoRefId(src)).then(
      (blob) => {
        if (cancelled) return;
        if (!blob) return; // deleted/missing — shows nothing rather than a broken image
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
      },
      () => {
        /* IndexedDB unavailable or the read failed — same "show nothing" fallback */
      }
    );
    return () => {
      cancelled = true;
      // Revoking on cleanup, not just on the next successful resolve, is
      // what actually prevents the leak — an unmount mid-fetch would
      // otherwise never revoke the URL this effect was about to create.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!resolvedSrc) return null;
  return <img src={resolvedSrc} alt={alt} className={className} />;
}
