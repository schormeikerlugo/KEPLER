import os
from dotenv import load_dotenv
from supabase import create_client
import json

load_dotenv("backend/.env")

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
client = create_client(url, key)

print("=" * 60)
print("AUDITORÍA COMPLETA DE OBJETOS")
print("=" * 60)

res = client.table("objetos_exploracion").select("*").execute()

for i, obj in enumerate(res.data, 1):
    print(f"\n{'='*60}")
    print(f"OBJETO #{i}")
    print(f"{'='*60}")
    print(f"  ID:          {obj.get('id')}")
    print(f"  Nombre:      {obj.get('nombre') or '❌ VACÍO'}")
    print(f"  Tipo:        {obj.get('tipo') or '❌ VACÍO'}")
    print(f"  UserID:      {obj.get('user_id') or '❌ SIN DUEÑO'}")
    print(f"  Descripción: {obj.get('descripcion') or '❌ VACÍO'}")
    print(f"  Posición:    {obj.get('posicion') or '❌ SIN COORDENADAS'}")
    print(f"  Creado:      {obj.get('created_at')}")
    
    # Check metadata
    metadata = obj.get('metadata')
    if metadata:
        print(f"  Metadata:")
        print(f"    - Confianza: {metadata.get('confidence', 'N/A')}")
        print(f"    - Fuente:    {metadata.get('source', 'N/A')}")
        print(f"    - Imagen:    {'✅ SÍ' if metadata.get('image_base64') else '❌ NO'}")
    else:
        print(f"  Metadata:    ❌ VACÍO")
    
    # Evaluate if it's "junk"
    is_junk = not obj.get('nombre') and not obj.get('tipo') and not obj.get('descripcion')
    print(f"\n  🗑️ ¿BASURA?: {'SÍ - CANDIDATO A BORRAR' if is_junk else 'NO - PARECE VÁLIDO'}")

print(f"\n{'='*60}")
print(f"RESUMEN: {len(res.data)} objetos encontrados")

# Count junk
junk_count = sum(1 for obj in res.data if not obj.get('nombre') and not obj.get('tipo'))
print(f"Candidatos a borrar (sin nombre ni tipo): {junk_count}")
print(f"{'='*60}")
