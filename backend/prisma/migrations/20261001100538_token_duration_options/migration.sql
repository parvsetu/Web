-- AlterTable
ALTER TABLE "events" ADD COLUMN     "tokenDurationOptions" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
