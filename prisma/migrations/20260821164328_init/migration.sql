-- DropForeignKey
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_monitorId_fkey";

-- DropForeignKey
ALTER TABLE "PingLog" DROP CONSTRAINT "PingLog_monitorId_fkey";

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "lastFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "PingLog" ADD CONSTRAINT "PingLog_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_monitorId_fkey" FOREIGN KEY ("monitorId") REFERENCES "Monitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
