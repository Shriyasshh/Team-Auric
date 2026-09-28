"""Custom Error Classes for the SDK."""


class SDKBaseError(Exception):
    def __init__(self, message, code="INTERNAL_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code
        self.name = self.__class__.__name__


class ProviderError(SDKBaseError):
    def __init__(self, message):
        super().__init__(message, "PROVIDER_ERROR")


class TransactionError(SDKBaseError):
    def __init__(self, message):
        super().__init__(message, "TRANSACTION_ERROR")


class WalletError(SDKBaseError):
    def __init__(self, message):
        super().__init__(message, "WALLET_ERROR")
