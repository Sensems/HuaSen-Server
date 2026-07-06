/*
  Warnings:

  - The primary key for the `note_media` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `created_at` on the `note_media` table. All the data in the column will be lost.
  - You are about to drop the column `file_size` on the `note_media` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `note_media` table. All the data in the column will be lost.
  - You are about to drop the column `mime_type` on the `note_media` table. All the data in the column will be lost.
  - You are about to drop the column `qiniu_key` on the `note_media` table. All the data in the column will be lost.
  - You are about to drop the column `qiniu_url` on the `note_media` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `note_media` table. All the data in the column will be lost.
  - You are about to drop the column `wx_media_id` on the `note_media` table. All the data in the column will be lost.
  - Added the required column `media_id` to the `note_media` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'ATTACHED', 'ORPHAN');

-- AlterTable
ALTER TABLE "note_media" DROP CONSTRAINT "note_media_pkey",
DROP COLUMN "created_at",
DROP COLUMN "file_size",
DROP COLUMN "id",
DROP COLUMN "mime_type",
DROP COLUMN "qiniu_key",
DROP COLUMN "qiniu_url",
DROP COLUMN "type",
DROP COLUMN "wx_media_id",
ADD COLUMN     "media_id" UUID NOT NULL,
ADD CONSTRAINT "note_media_pkey" PRIMARY KEY ("note_id", "media_id");

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "MediaType" NOT NULL,
    "qiniu_key" VARCHAR(512) NOT NULL,
    "qiniu_url" VARCHAR(512) NOT NULL,
    "wx_media_id" VARCHAR(128),
    "file_size" INTEGER,
    "mime_type" VARCHAR(64),
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_user_id_status_idx" ON "media"("user_id", "status");

-- AddForeignKey
ALTER TABLE "note_media" ADD CONSTRAINT "note_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
