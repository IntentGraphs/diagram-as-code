# Bounded image-size compatibility shim

This private compatibility package is used only to satisfy PptxGenJS's
optional image-dimension dependency. The workspace PPTX exporter emits native
vector shapes and does not accept raster images. The shim supports bounded PNG,
GIF, BMP, and JPEG header inspection and rejects unsupported formats, including
ICNS, JXL, and HEIF. It intentionally does not contain the vulnerable parser
implementations from the upstream package.
