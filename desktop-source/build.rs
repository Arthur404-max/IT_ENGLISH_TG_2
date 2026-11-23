use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-env-changed=DEP_LLAMA_GGML_CMAKE_DIR");

    if std::env::var_os("CARGO_FEATURE_EMBEDDED").is_none() {
        return;
    }

    // `llama-cpp-sys-2` discovers static libraries by the `lib` prefix. On
    // MinGW the ggml archives are installed as `ggml.a`, `ggml-base.a` and
    // `ggml-cpu.a`, so the sys crate misses them and the final link fails.
    // Its build script exposes the ggml CMake package directory; use it to
    // find the matching libraries and add them explicitly.
    let Ok(cmake_dir) = std::env::var("DEP_LLAMA_GGML_CMAKE_DIR") else {
        println!("cargo:warning=llama ggml CMake directory is unavailable; embedded build may fail to link");
        return;
    };

    let Some(lib_dir) = PathBuf::from(cmake_dir).parent().map(PathBuf::from) else {
        return;
    };

    println!("cargo:rustc-link-search=native={}", lib_dir.display());

    // Exact archive names are needed because these ggml libraries have no
    // `lib` prefix on MinGW. Link args are appended after Rust's native
    // libraries, so their symbols are available to llama.cpp at this point.
    println!("cargo:rustc-link-arg=-l:ggml.a");
    println!("cargo:rustc-link-arg=-l:ggml-base.a");
    println!("cargo:rustc-link-arg=-l:ggml-cpu.a");
    // ggml-cpu uses math functions (sinf, cosf, ...) provided by the MinGW
    // CRT. They must be requested after the ggml archives, otherwise the
    // linker has already passed Rust's own CRT flags. The C++ runtime is
    // requested statically for the same reason: the embedded executable must
    // not need libstdc++-6.dll from the build machine.
    println!("cargo:rustc-link-arg=-Wl,-Bstatic");
    println!("cargo:rustc-link-arg=-lstdc++");
    println!("cargo:rustc-link-arg=-lwinpthread");
    println!("cargo:rustc-link-arg=-lgcc_eh");
    println!("cargo:rustc-link-arg=-lgcc");
    println!("cargo:rustc-link-arg=-Wl,-Bdynamic");
    println!("cargo:rustc-link-arg=-lmsvcrt");
    println!("cargo:rustc-link-arg=-lmingwex");
    println!("cargo:rustc-link-arg=-lmsvcrt-os");
    println!("cargo:rustc-link-arg=-lmsvcrt");
    println!("cargo:rustc-link-arg=-lkernel32");
    println!("cargo:rustc-link-arg=-ladvapi32");
}
