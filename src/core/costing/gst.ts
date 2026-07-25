/**
 * GST — Australian, 10%, and not a display toggle.
 *
 * The two registration contexts are different arithmetic on the *cost* side, not just the
 * invoice side:
 *
 *   Registered      GST paid on materials is claimed back as an input tax credit, so the true
 *                   cost of a sheet is its ex-GST price. 10% GST is then charged on the sale.
 *
 *   Not registered  GST paid on materials cannot be claimed. It is a real, unrecoverable cost,
 *                   so the cost base is the GST-inclusive price. No GST is charged on the sale.
 *
 * Treating the unregistered case as "the same numbers, just don't add GST at the end"
 * understates cost by the GST on every sheet and every metre of edging — around 9% of
 * material cost — which is margin quietly disappearing.
 */

import { type Cents, roundCents } from '../units.ts';
import type { GstMode } from '../model/project.ts';

export const GST_RATE = 0.1;

export const addGst = (exGst: Cents): Cents => roundCents(exGst * (1 + GST_RATE));

/** Strip GST from a GST-inclusive amount. */
export const removeGst = (incGst: Cents): Cents => roundCents(incGst / (1 + GST_RATE));

/** The GST portion of a GST-inclusive amount — one eleventh. */
export const gstComponent = (incGst: Cents): Cents => roundCents(incGst / 11);

/**
 * What a supplier price actually costs this entity.
 *
 * Supplier trade prices are stored ex-GST throughout the material library, so this is where
 * an unregistered entity picks up the GST it can't claim back.
 *
 * Takes an unrounded amount and rounds once, at the end. Rounding to cents first and then
 * applying GST rounds twice, which pushes the registered/unregistered ratio measurably off
 * 1.1 on small per-part amounts.
 */
export const effectiveCost = (rawExGst: number, mode: GstMode): Cents =>
  roundCents(mode === 'registered' ? rawExGst : rawExGst * (1 + GST_RATE));

/** GST charged on a sale. Zero for an entity that isn't registered. */
export const gstOnSale = (sellExGst: Cents, mode: GstMode): Cents =>
  mode === 'registered' ? roundCents(sellExGst * GST_RATE) : 0;

export const gstModeLabel = (mode: GstMode): string =>
  mode === 'registered' ? 'GST registered' : 'Not GST registered';
