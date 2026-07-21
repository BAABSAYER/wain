# Bundled map assets

These low-poly GLB models are bundled with Wain so the public map does not rely
on an external asset host.

Sources:

- Kenney Furniture Kit: stairs, escalator, reception desk, security desk,
  dining table, several bench, chair, sofa, table, floor-lamp and potted-plant
  variants, planter, and trash bin.
- Kenney Nature Kit: tree and information sign.
- Kenney City Kit (Roads): parking sign, directional sign, and barrier.

The source packs are released under Creative Commons CC0 1.0:

- https://kenney.nl/assets/furniture-kit
- https://kenney.nl/assets/nature-kit
- https://kenney.nl/assets/city-kit-roads
- https://creativecommons.org/publicdomain/zero/1.0/

Additional models from Poly Pizza are released under Creative Commons
Attribution and are included with attribution here:

- "ATM" by J-Toastie: https://poly.pizza/m/p4U0tSF5WN
- "Vending Machine" by J-Toastie: https://poly.pizza/m/ZhziWexNWk
- "Elevator" by Poly by Google: https://poly.pizza/m/aZ7y77mq_u6
- https://creativecommons.org/licenses/by/3.0/

The `modelUrl` value on an asset can override these defaults with another GLB or
glTF file served by the application.

Map-symbol placements use small procedural 3D glyphs that match the admin
canvas. Furniture choices use the bundled GLB path in `modelUrl`, which allows
several models to share one logical asset type. Door placements always use the
direction arrow so their rotation communicates entrance/exit direction clearly.
