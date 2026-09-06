fn main() {
    let handle = dadix_core::open_or_create_demo_project().expect("create demo");
    println!("{}", handle.path().display());
    dadix_core::close_project(handle).expect("close demo");
}
