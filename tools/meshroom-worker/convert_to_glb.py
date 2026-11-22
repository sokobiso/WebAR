import bpy
import os
import sys

args = sys.argv[sys.argv.index("--") + 1:]
source, destination = args[0], args[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=source)
os.makedirs(os.path.dirname(destination), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=destination, export_format="GLB")
