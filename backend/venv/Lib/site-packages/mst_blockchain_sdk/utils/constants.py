"""Global Constants."""

CHAINS = {
    "MAINNET": 1,
    "TESTNET": 91562037,
}

NETWORKS = {
    "mainnet": "https://mariorpc.mstblockchain.com/",
    "testnet": "https://testnetrpc.mstblockchain.com",
}

DEFAULT_NETWORK = "testnet"
GAS_LIMIT = 21000


def get_rpc_url(network):
    try:
        return NETWORKS[network.lower()]
    except (KeyError, AttributeError):
        raise ValueError(
            f"Unsupported network: {network!r}. Expected one of {list(NETWORKS)}"
        ) from None
