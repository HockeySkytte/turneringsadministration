-- Add user gender preference

CREATE TYPE "Gender" AS ENUM ('MEN', 'WOMEN');

ALTER TABLE "User"
ADD COLUMN "gender" "Gender" NOT NULL DEFAULT 'MEN';
