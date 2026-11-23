/**
 * Last-resort resolver for addresses that have no pre-built page: hand-typed
 * or abbreviated references such as /rfc/5v6.+ or /RFC/5V1. Uses the same
 * parser as the build, and /index/versions.json to see what exists.
 */
import {
  entryPath,
  listPath,
  parseRef,
  parseVersion,
  resolveRef,
  toTypeId,
  type Version,
} from '../lib/eid.ts';

async function resolve() {
  const [typeName, refText] = location.pathname.split('/').filter(Boolean);
  const type = typeName && toTypeId(typeName);
  const ref = refText && parseRef(decodeURIComponent(refText));
  if (!type || !ref) return;

  const index: Record<string, Record<string, string[]>> = await (await fetch('/index/versions.json')).json();
  const known = index[type]?.[ref.uid];
  if (!known) return;
  const versions = known.map((v) => parseVersion(v)).filter((v): v is Version => !!v);

  if (ref.kind === 'list') return location.replace(listPath(type, ref.uid) + location.search + location.hash);
  const version = resolveRef(ref, versions);
  if (version) return location.replace(entryPath(type, ref.uid, version) + location.search + location.hash);

  // The entry exists but that version does not: point at its version list.
  const hint = document.querySelector('#hint')!;
  hint.innerHTML = `There is no such version of <code>${type}/${ref.uid}</code>. See <a href="${listPath(type, ref.uid)}">all of its versions</a>.`;
}
resolve().catch(() => {});
