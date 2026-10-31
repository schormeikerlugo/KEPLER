-- Fix Embedding Dimension Mismatch
-- Change from vector(1024) to vector(512) to match CLIP-ViT-B-32 output

-- Step 1: Drop existing embedding column if it has data (optional backup first)
-- If you have existing embeddings, this will delete them. 
-- If that's a problem, comment this line and manually backup first.

ALTER TABLE objetos_exploracion 
DROP COLUMN IF EXISTS embedding;

-- Step 2: Add embedding column with correct dimension
ALTER TABLE objetos_exploracion 
ADD COLUMN embedding vector(512);

-- Step 3: Create or update the index for similarity search
DROP INDEX IF EXISTS idx_embedding_cosine;
CREATE INDEX idx_embedding_cosine ON objetos_exploracion 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Done! Now the database accepts 512-dimensional vectors from CLIP.
