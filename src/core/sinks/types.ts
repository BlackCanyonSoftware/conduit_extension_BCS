import type { HeaderDirection } from '../rules/types';

export type WantKind = 'cookie' | 'header' | 'storage';

/** One thing an app asks for in its handshake. Nothing happens until the person approves it. */
export interface Want {
  /** The id the app uses to recognise this request when a value is delivered. */
  id: string;
  kind: string;
  /** The site as the app wrote it, for example `https://*.example.com`. */
  origin: string;
  /** Cookie or header names. Header names are lower case. */
  names: string[];
  /** For a header request: request or response headers. */
  direction?: HeaderDirection;
  /** The app's reason, shown to the person word for word. */
  why: string;
  /** The main domain the request covers, worked out from `origin`. */
  site?: string;
  /** Why this request cannot be approved in this version, when that is so. */
  problem?: string;
}

/** An app the person has added: an HTTP address that receives approved captures. */
export interface Sink {
  id: string;
  name: string;
  /** Base address without a trailing slash, for example `http://127.0.0.1:8778`. */
  url: string;
  /** True when the app is on this computer. Anything else was confirmed by typing its host name. */
  loopback: boolean;
  confirmedAt?: string;
  /** A delivery path of the app's own, used instead of `/conduit/deliver`. */
  route?: string;
  addedAt: string;
}

/** The host and port of an app, as shown to the person. */
export function sinkTarget(sink: Pick<Sink, 'url'>): string {
  return new URL(sink.url).host;
}
