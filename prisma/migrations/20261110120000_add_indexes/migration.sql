CREATE INDEX "PingLog_monitorId_checkedAt_idx" ON "PingLog"("monitorId", "checkedAt");
CREATE INDEX "PingLog_checkedAt_idx" ON "PingLog"("checkedAt");
CREATE INDEX "Alert_monitorId_status_idx" ON "Alert"("monitorId", "status");