package store

import (
	"crypto/rand"
	"encoding/hex"
)

func newID() string {
	return randomHex(8)
}

func newToken() string {
	return randomHex(32)
}

func randomHex(size int) string {
	bytes := make([]byte, size)

	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}

	return hex.EncodeToString(bytes)
}
