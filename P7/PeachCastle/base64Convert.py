import os
import base64
import json
from PIL import Image

def image_to_base64(image_path):
    with open(image_path, "rb") as image_file:
        encoded_image = base64.b64encode(image_file.read())
        return encoded_image.decode('utf-8')

def convert_images_to_base64(folder_path, output_file):
    base64_dict = {}
    for filename in os.listdir(folder_path):
        if filename.endswith(('.png', '.jpg', '.jpeg', '.gif')):
            image_path = os.path.join(folder_path, filename)
            base64_data = image_to_base64(image_path)
            base64_dict[filename] = base64_data

    with open(output_file, "w") as json_file:
        json.dump(base64_dict, json_file, indent=2)

if __name__ == "__main__":
    folder_path = "."
    output_file = "output.json"
    convert_images_to_base64(folder_path, output_file)

