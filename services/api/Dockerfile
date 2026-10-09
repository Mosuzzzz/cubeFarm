FROM golang:1.24-alpine AS builder
WORKDIR /src
ENV GOCACHE=/go-cache
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN mkdir -p "$GOCACHE" && CGO_ENABLED=0 go build -trimpath -o /smartfarm-api ./cmd/server
FROM alpine:3.21
RUN adduser -D -H app
USER app
COPY --from=builder /smartfarm-api /smartfarm-api
EXPOSE 8080
ENTRYPOINT ["/smartfarm-api"]
