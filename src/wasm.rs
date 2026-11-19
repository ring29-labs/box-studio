//! Raw WebAssembly ABI. The same JSON calculation engine is linked on macOS.
use std::os::raw::c_char;
#[unsafe(no_mangle)]
pub extern "C" fn box_alloc(len: usize) -> *mut c_char {
    Box::into_raw(vec![0u8; len].into_boxed_slice()) as *mut c_char
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn box_dealloc(p: *mut c_char, len: usize) {
    if !p.is_null() {
        drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(p as *mut u8, len)) });
    }
}
#[unsafe(no_mangle)]
pub unsafe extern "C" fn box_result_len(p: *const c_char) -> usize {
    if p.is_null() {
        0
    } else {
        unsafe { std::ffi::CStr::from_ptr(p) }.to_bytes().len()
    }
}
