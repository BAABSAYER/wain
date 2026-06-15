import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import * as QRCode from "qrcode";
import { randomBytes } from "crypto";

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

  async create(buildingId: string, floorId: string, nodeId: string, label: string, appBaseUrl: string) {
    const code = `QR-${randomBytes(4).toString("hex").toUpperCase()}`;

    const url = `${appBaseUrl}/nav/${buildingId}/${floorId}/${nodeId}`;
    const qrImageUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      width: 512,
      color: { dark: "#0f172a", light: "#ffffff" },
    });

    return this.prisma.qRPoint.create({
      data: { buildingId, floorId, nodeId, code, label, qrImageUrl },
    });
  }

  findByBuilding(buildingId: string) {
    return this.prisma.qRPoint.findMany({
      where: { buildingId },
      include: { node: true },
    });
  }

  async resolve(code: string) {
    const qr = await this.prisma.qRPoint.findUnique({
      where: { code },
      include: {
        node: true,
        building: { include: { floors: { orderBy: { level: "asc" } } } },
      },
    });
    if (!qr) throw new NotFoundException(`QR code ${code} not found`);
    return qr;
  }

  async remove(id: string) {
    return this.prisma.qRPoint.delete({ where: { id } });
  }

  /**
   * Re-bake the QR PNG for every QR record on a building using the given
   * appBaseUrl. The QR `code` (the short string used by /qr/resolve) stays
   * the same, so any QR already printed and physically stuck on a wall keeps
   * working — only the URL embedded in the rendered image changes.
   */
  async regenerateForBuilding(buildingId: string, appBaseUrl: string) {
    const qrs = await this.prisma.qRPoint.findMany({ where: { buildingId } });
    for (const qr of qrs) {
      const url = `${appBaseUrl}/nav/${qr.buildingId}/${qr.floorId}/${qr.nodeId}`;
      const qrImageUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "M",
        width: 512,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      await this.prisma.qRPoint.update({ where: { id: qr.id }, data: { qrImageUrl } });
    }
    return { buildingId, appBaseUrl, regenerated: qrs.length };
  }
}
