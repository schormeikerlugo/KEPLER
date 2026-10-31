import torch
import traceback
import base64
import io
import json
from PIL import Image

class AIService:
    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        self.visual_model = None
        self._load_model()

    def _load_model(self):
        try:
            from sentence_transformers import SentenceTransformer
            print(f"AI: Using device: {self.device}")
            print("AI: Loading Vision Model...")
            self.visual_model = SentenceTransformer('clip-ViT-B-32', device=self.device)
            self.visual_model.max_seq_length = 512
            print(f"AI: Vision Model Loaded on {self.device.upper()}.")
        except ImportError:
            print("AI: Modules not found (sentence_transformers). AI features limited.")
            self.visual_model = None
        except Exception as e:
            print(f"AI Load Error: {e}")
            self.visual_model = None

    def generate_embedding(self, image_base64: str) -> list:
        if not self.visual_model:
            raise Exception("AI Model not loaded.")
        
        try:
            if ',' in image_base64:
                image_base64 = image_base64.split(',')[1]
            
            image_data = base64.b64decode(image_base64)
            image = Image.open(io.BytesIO(image_data))
            
            with torch.no_grad():
                embedding = self.visual_model.encode(
                    image, 
                    convert_to_numpy=True, 
                    show_progress_bar=False, 
                    batch_size=1
                )
            return embedding.tolist()
        except Exception as e:
            print(f"Embedding Gen Error: {e}")
            raise e

    def enrich_label(self, label: str) -> dict:
        if not label:
            return {"description": "No data.", "category": "common"}
            
        try:
            import ollama
            prompt = (
                f"Analyze '{label}'. "
                f"1. Provide a natural description in Spanish (español), concise (2 sentences). "
                f"2. Classify it strictly into one of these categories: [tech, common, plant, animal, person, place, water, hazard]. "
                f"Return ONLY a valid JSON object like this: {{ 'description': '...', 'category': '...' }}"
            )
            
            response = ollama.chat(model='llama3:8b-instruct-q6_K', messages=[
              {'role': 'user', 'content': prompt}
            ])
            
            content = response['message']['content']
            
            # Simple parsing
            try:
                start = content.find('{')
                end = content.rfind('}') + 1
                if start != -1 and end != -1:
                    return json.loads(content[start:end])
                else:
                    return {"description": content, "category": "common"}
            except:
                 return {"description": content, "category": "common"}

        except ImportError:
            return {"description": "AI Module Missing", "category": "unknown"}
        except Exception as e:
            print(f"Enrich Error: {e}")
            return {"description": "AI Analysis Failed", "category": "unknown"}

    def generate_contextual_description(
        self,
        object_name: str,
        category: str = None,
        subcategory: str = None,
        tags: list = None,
        location_context: str = None
    ) -> str:
        """
        Genera una descripción inteligente usando Llama 3 con contexto de taxonomía.
        Usa la categoría, subcategoría y etiquetas para generar descripciones más precisas.
        """
        try:
            import ollama
            
            # Build context string
            context_parts = []
            if category:
                context_parts.append(f"Categoría: {category}")
            if subcategory:
                context_parts.append(f"Subcategoría: {subcategory}")
            if tags and len(tags) > 0:
                context_parts.append(f"Etiquetas: {', '.join(tags)}")
            if location_context:
                context_parts.append(f"Contexto de ubicación: {location_context}")
            
            context_str = "\n".join(context_parts) if context_parts else "Sin contexto adicional"
            
            prompt = f"""Genera una descripción útil y concisa para el siguiente objeto detectado.

Nombre del objeto: {object_name}
{context_str}

Instrucciones:
- La descripción debe ser en español
- Máximo 2-3 oraciones
- Debe ser informativa para futuras búsquedas
- Si hay contexto de categoría/etiquetas, úsalo para enriquecer la descripción
- NO incluyas el nombre de la categoría literalmente, solo usa el contexto para mejorar la descripción

Responde SOLO con la descripción, sin explicaciones adicionales."""
            
            response = ollama.chat(
                model='llama3:8b-instruct-q6_K',
                messages=[{'role': 'user', 'content': prompt}]
            )
            
            description = response['message']['content'].strip()
            
            # Clean up any quotes or extra formatting
            if description.startswith('"') and description.endswith('"'):
                description = description[1:-1]
            
            return description
            
        except ImportError:
            return f"{object_name} detectado automáticamente."
        except Exception as e:
            print(f"Contextual Description Error: {e}")
            return f"{object_name} - objeto registrado en el sistema."

# Global Instance
ai_service = AIService()
