#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]

#[cfg(not(any(test, feature = "export-abi")))]
#[no_mangle]
pub extern "C" fn main() {}

/// `cargo stylus export-abi` prints the Solidity interface.
#[cfg(feature = "export-abi")]
fn main() {
    premium_calculator::print_from_args();
}
