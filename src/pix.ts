/**
 * Geração de Pix estático no padrão BR Code (EMV) do Banco Central.
 * Não depende de API de banco/PSP: o cliente escaneia o QR, paga, e o
 * lojista confirma manualmente no painel admin quando o valor cair na conta.
 *
 * Referência do formato: manual "Pix - QR Codes" do BCB (campos EMV
 * 00, 26, 52, 53, 54, 58, 59, 60, 62, 63).
 */
import QRCode from "qrcode";

import { MERCHANT_CITY, MERCHANT_NAME, PIX_KEY } from "./config";

/** Codifica um campo TLV (Tag-Length-Value) do padrão EMV. */
function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF), exigido no campo 63 do Pix. */
function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(text: string, maxLen: number): string {
  const cleaned = [...text]
    .filter((c) => /[\p{L}\p{N} -]/u.test(c))
    .join("")
    .trim();
  return (cleaned || "NA").slice(0, maxLen);
}

/** Monta a string "copia e cola" do Pix estático com valor fixo. */
export function buildPixPayload(amount: number, txid: string, description = ""): string {
  const safeTxid = txid ? sanitize(txid, 25) : "***";

  const merchantAccount =
    tlv("00", "br.gov.bcb.pix") +
    tlv("01", PIX_KEY) +
    (description ? tlv("02", description.slice(0, 40)) : "");

  const fields =
    tlv("00", "01") + //                              Payload Format Indicator
    tlv("26", merchantAccount) + //                   Merchant Account Info (Pix)
    tlv("52", "0000") + //                            Merchant Category Code
    tlv("53", "986") + //                             Currency = BRL
    tlv("54", amount.toFixed(2)) + //                 Valor da transação
    tlv("58", "BR") + //                              Country code
    tlv("59", sanitize(MERCHANT_NAME, 25)) + //       Nome do recebedor
    tlv("60", sanitize(MERCHANT_CITY, 15)) + //       Cidade do recebedor
    tlv("62", tlv("05", safeTxid)); //                Additional Data (txid)

  const payloadWithoutCrc = fields + "6304";
  return payloadWithoutCrc + crc16Ccitt(payloadWithoutCrc);
}

/** Gera um PNG do QR code do payload Pix, retornado como base64. */
export async function generateQrcodeBase64(payload: string): Promise<string> {
  const png = await QRCode.toBuffer(payload, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 4,
    scale: 10,
  });
  return png.toString("base64");
}
