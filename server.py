from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".cjs": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json; charset=utf-8",
    }


def main(host: str = "127.0.0.1", port: int = 5175) -> None:
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Serving on http://{host}:{port}/")
    server.serve_forever()


if __name__ == "__main__":
    main()

