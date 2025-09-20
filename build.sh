emcc --bind -o ./src/wasm/remesh.js \
    src/wasm/remesh-wrapper.cpp \
    -I/home/mv740/lib/geogram/include/geogram1 \
    -L/home/mv740/lib/geogram/lib \
    -lgeogram \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s EXPORT_ES6=1 \
    -s MODULARIZE=1 \
    -s SINGLE_FILE=1 \
    -s EXPORT_NAME="RemeshModule" \
    -s ASSERTIONS=1 \
    -std=c++17 \
    -O2 \
    -lembind \
    -s EXCEPTION_CATCHING_ALLOWED=['all'] \
   --emit-tsd "remesh.d.ts" \
   -sUSE_ZLIB=1 --use-port=zlib
    # https://dev.to/joyhughes/a-simple-web-app-using-vitereact-c-emscripten-webassembly-and-a-web-worker-48ia