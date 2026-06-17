import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import * as QRCode from "qrcode";
import { randomBytes } from "crypto";

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the URL that gets embedded in the QR PNG. Always code-based
   * (`/qr/<code>`) so the printed sticker keeps working even if the
   * underlying nav node is moved, renumbered, or deleted — the resolve
   * step at scan time looks up whatever node the QR currently points at.
   */
  private buildEmbedUrl(appBaseUrl: string, code: string) {
    return `${appBaseUrl.replace(/\/$/, "")}/qr/${code}`;
  }

  private async renderPng(url: string) {
    return QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      width: 512,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  }

  async create(buildingId: string, floorId: string, nodeId: string | null, label: string, appBaseUrl: string) {
    const code = `QR-${randomBytes(4).toString("hex").toUpperCase()}`;
    const qrImageUrl = await this.renderPng(this.buildEmbedUrl(appBaseUrl, code));
    return this.prisma.qRPoint.create({
      data: { buildingId, floorId, nodeId, code, label, qrImageUrl },
    });
  }

  findByBuilding(buildingId: string) {
    return this.prisma.qRPoint.findMany({
      where: { buildingId },
      include: { node: true },
      orderBy: { createdAt: "asc" },
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
   * Point an existing QR at a different (or no) nav node. Lets a printed
   * sticker survive node deletes / map redraws — the admin just reassigns
   * it in the UI; no need to re-print anything.
   */
  async reassign(id: string, patch: { nodeId?: string | null; floorId?: string; label?: string }) {
    const existing = await this.prisma.qRPoint.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`QR ${id} not found`);
    return this.prisma.qRPoint.update({
      where: { id },
      data: {
        nodeId: patch.nodeId === undefined ? existing.nodeId : patch.nodeId,
        floorId: patch.floorId ?? existing.floorId,
        label: patch.label ?? existing.label,
      },
      include: { node: true },
    });
  }

  /**
   * Re-render every QR PNG for a building using the current embed URL
   * scheme. Used after a domain change or to migrate older QRs from the
   * legacy `/nav/<bid>/<fid>/<nid>` embed to the stable `/qr/<code>`
   * embed. The QR `code` is unchanged so any sticker already on a wall
   * stays valid — only the PNG inside the admin gets refreshed.
   */
  async regenerateForBuilding(buildingId: string, appBaseUrl: string) {
    const qrs = await this.prisma.qRPoint.findMany({ where: { buildingId } });
    for (const qr of qrs) {
      const qrImageUrl = await this.renderPng(this.buildEmbedUrl(appBaseUrl, qr.code));
      await this.prisma.qRPoint.update({ where: { id: qr.id }, data: { qrImageUrl } });
    }
    return { buildingId, appBaseUrl, regenerated: qrs.length };
  }
}
