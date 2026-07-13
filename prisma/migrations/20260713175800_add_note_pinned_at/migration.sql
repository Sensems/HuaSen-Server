-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "pinned_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notes_user_id_pinned_at_idx" ON "notes"("user_id", "pinned_at");
