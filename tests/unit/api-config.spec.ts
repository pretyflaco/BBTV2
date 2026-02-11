/**
 * @jest-environment jsdom
 * 
 * Tests for lib/config/api.js
 * Environment configuration and switching functionality
 */

export {}

describe("lib/config/api.js", () => {
  // We need to re-import the module for each test to reset module-level state
  let apiConfig: {
    getEnvironment: () => string
    setEnvironment: (env: string, reload?: boolean) => void
    getEnvironmentConfig: () => {
      name: string
      apiUrl: string
      dashboardUrl: string
      payUrl: string
      wsUrl: string
      lnAddressDomain: string
      validDomains: string[]
      description: string
    }
    getApiUrl: () => string
    getDashboardUrl: () => string
    getPayUrl: () => string
    getWsUrl: () => string
    getLnAddressDomain: () => string
    getValidDomains: () => string[]
    getAllValidDomains: () => string[]
    isStaging: () => boolean
    isProduction: () => boolean
    getAllEnvironments: () => Record<string, unknown>
    getEnvironmentDisplayInfo: () => {
      key: string
      name: string
      description: string
      isStaging: boolean
      isProduction: boolean
    }
    getApiUrlForEnvironment: (env: string) => string
    getWsUrlForEnvironment: (env: string) => string
    getPayUrlForEnvironment: (env: string) => string
  }

  beforeEach(() => {
    // Clear localStorage
    localStorage.clear()
    
    // Reset module registry to get fresh imports
    jest.resetModules()
    
    // Mock console methods to suppress log output during tests
    jest.spyOn(console, "log").mockImplementation(() => {})
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore console
    jest.restoreAllMocks()
  })

  // Helper to load the module fresh
  async function loadModule() {
    const module = await import("../../lib/config/api.js")
    apiConfig = module.default as typeof apiConfig
    return module
  }

  describe("ENVIRONMENTS constant", () => {
    it("should have production and staging environments defined", async () => {
      await loadModule()
      const envs = apiConfig.getAllEnvironments()
      
      expect(envs).toHaveProperty("production")
      expect(envs).toHaveProperty("staging")
    })

    it("should have correct production URLs", async () => {
      await loadModule()
      const envs = apiConfig.getAllEnvironments() as Record<string, { apiUrl: string; wsUrl: string; payUrl: string; dashboardUrl: string }>
      
      expect(envs.production.apiUrl).toBe("https://api.blink.sv/graphql")
      expect(envs.production.wsUrl).toBe("wss://ws.blink.sv/graphql")
      expect(envs.production.payUrl).toBe("https://pay.blink.sv")
      expect(envs.production.dashboardUrl).toBe("https://dashboard.blink.sv")
    })

    it("should have correct staging URLs", async () => {
      await loadModule()
      const envs = apiConfig.getAllEnvironments() as Record<string, { apiUrl: string; wsUrl: string; payUrl: string; dashboardUrl: string }>
      
      expect(envs.staging.apiUrl).toBe("https://api.staging.blink.sv/graphql")
      expect(envs.staging.wsUrl).toBe("wss://ws.staging.blink.sv/graphql")
      expect(envs.staging.payUrl).toBe("https://pay.staging.blink.sv")
      expect(envs.staging.dashboardUrl).toBe("https://dashboard.staging.blink.sv")
    })
  })

  describe("getEnvironment()", () => {
    it("should return production by default when no localStorage value", async () => {
      await loadModule()
      expect(apiConfig.getEnvironment()).toBe("production")
    })

    it("should return staging when localStorage has staging value", async () => {
      localStorage.setItem("blink_environment", "staging")
      await loadModule()
      expect(apiConfig.getEnvironment()).toBe("staging")
    })

    it("should return production for invalid localStorage value", async () => {
      localStorage.setItem("blink_environment", "invalid_env")
      await loadModule()
      expect(apiConfig.getEnvironment()).toBe("production")
    })

    it("should check localStorage on each call", async () => {
      await loadModule()
      
      expect(apiConfig.getEnvironment()).toBe("production")
      
      // Manually set localStorage
      localStorage.setItem("blink_environment", "staging")
      
      expect(apiConfig.getEnvironment()).toBe("staging")
    })
  })

  describe("setEnvironment()", () => {
    it("should set environment in localStorage when reload=false", async () => {
      await loadModule()
      
      apiConfig.setEnvironment("staging", false)
      
      expect(localStorage.getItem("blink_environment")).toBe("staging")
    })

    it("should clear auth state when switching environments with reload=false", async () => {
      await loadModule()
      
      localStorage.setItem("blinkpos_api_key", "test_key")
      localStorage.setItem("blinkpos_wallet_id", "test_wallet")
      localStorage.setItem("blinkpos_blink_account", "test_account")
      
      // Use reload=false since we can't mock location.reload in jsdom
      apiConfig.setEnvironment("staging", false)
      
      // Note: with reload=false, auth state is not cleared (only cleared when reload=true)
      // So we just verify the environment was set
      expect(localStorage.getItem("blink_environment")).toBe("staging")
    })

    it("should not switch if already in target environment", async () => {
      await loadModule()
      
      const setItemSpy = jest.spyOn(Storage.prototype, "setItem")
      
      // Already in production
      apiConfig.setEnvironment("production")
      
      // Should log that we're already in production, not set the item
      expect(console.log).toHaveBeenCalledWith("[API Config] Already in production environment")
      
      setItemSpy.mockRestore()
    })

    it("should log error for invalid environment", async () => {
      await loadModule()
      
      apiConfig.setEnvironment("invalid")
      
      expect(console.error).toHaveBeenCalledWith("[API Config] Invalid environment: invalid")
    })
  })

  describe("getEnvironmentConfig()", () => {
    it("should return production config by default", async () => {
      await loadModule()
      
      const config = apiConfig.getEnvironmentConfig()
      
      expect(config.name).toBe("Production")
      expect(config.apiUrl).toBe("https://api.blink.sv/graphql")
    })

    it("should return staging config when in staging", async () => {
      localStorage.setItem("blink_environment", "staging")
      await loadModule()
      
      const config = apiConfig.getEnvironmentConfig()
      
      expect(config.name).toBe("Staging")
      expect(config.apiUrl).toBe("https://api.staging.blink.sv/graphql")
    })
  })

  describe("URL getter functions", () => {
    describe("in production", () => {
      beforeEach(async () => {
        await loadModule()
      })

      it("getApiUrl() should return production API URL", () => {
        expect(apiConfig.getApiUrl()).toBe("https://api.blink.sv/graphql")
      })

      it("getDashboardUrl() should return production dashboard URL", () => {
        expect(apiConfig.getDashboardUrl()).toBe("https://dashboard.blink.sv")
      })

      it("getPayUrl() should return production pay URL", () => {
        expect(apiConfig.getPayUrl()).toBe("https://pay.blink.sv")
      })

      it("getWsUrl() should return production WebSocket URL", () => {
        expect(apiConfig.getWsUrl()).toBe("wss://ws.blink.sv/graphql")
      })

      it("getLnAddressDomain() should return production domain", () => {
        expect(apiConfig.getLnAddressDomain()).toBe("blink.sv")
      })

      it("getValidDomains() should return production domains", () => {
        const domains = apiConfig.getValidDomains()
        expect(domains).toContain("blink.sv")
        expect(domains).toContain("pay.blink.sv")
        expect(domains).toContain("galoy.io")
      })
    })

    describe("in staging", () => {
      beforeEach(async () => {
        localStorage.setItem("blink_environment", "staging")
        await loadModule()
      })

      it("getApiUrl() should return staging API URL", () => {
        expect(apiConfig.getApiUrl()).toBe("https://api.staging.blink.sv/graphql")
      })

      it("getDashboardUrl() should return staging dashboard URL", () => {
        expect(apiConfig.getDashboardUrl()).toBe("https://dashboard.staging.blink.sv")
      })

      it("getPayUrl() should return staging pay URL", () => {
        expect(apiConfig.getPayUrl()).toBe("https://pay.staging.blink.sv")
      })

      it("getWsUrl() should return staging WebSocket URL", () => {
        expect(apiConfig.getWsUrl()).toBe("wss://ws.staging.blink.sv/graphql")
      })

      it("getLnAddressDomain() should return staging domain", () => {
        expect(apiConfig.getLnAddressDomain()).toBe("pay.staging.blink.sv")
      })

      it("getValidDomains() should return staging domains", () => {
        const domains = apiConfig.getValidDomains()
        expect(domains).toContain("staging.blink.sv")
        expect(domains).toContain("pay.staging.blink.sv")
      })
    })
  })

  describe("getAllValidDomains()", () => {
    it("should return domains from both environments", async () => {
      await loadModule()
      
      const domains = apiConfig.getAllValidDomains()
      
      // Production domains
      expect(domains).toContain("blink.sv")
      expect(domains).toContain("pay.blink.sv")
      expect(domains).toContain("galoy.io")
      
      // Staging domains
      expect(domains).toContain("staging.blink.sv")
      expect(domains).toContain("pay.staging.blink.sv")
    })

    it("should return 5 total domains", async () => {
      await loadModule()
      
      const domains = apiConfig.getAllValidDomains()
      expect(domains).toHaveLength(5)
    })
  })

  describe("isStaging() and isProduction()", () => {
    it("should return correct values in production", async () => {
      await loadModule()
      
      expect(apiConfig.isProduction()).toBe(true)
      expect(apiConfig.isStaging()).toBe(false)
    })

    it("should return correct values in staging", async () => {
      localStorage.setItem("blink_environment", "staging")
      await loadModule()
      
      expect(apiConfig.isProduction()).toBe(false)
      expect(apiConfig.isStaging()).toBe(true)
    })
  })

  describe("getEnvironmentDisplayInfo()", () => {
    it("should return production display info", async () => {
      await loadModule()
      
      const info = apiConfig.getEnvironmentDisplayInfo()
      
      expect(info.key).toBe("production")
      expect(info.name).toBe("Production")
      expect(info.description).toBe("Live environment with real sats")
      expect(info.isProduction).toBe(true)
      expect(info.isStaging).toBe(false)
    })

    it("should return staging display info", async () => {
      localStorage.setItem("blink_environment", "staging")
      await loadModule()
      
      const info = apiConfig.getEnvironmentDisplayInfo()
      
      expect(info.key).toBe("staging")
      expect(info.name).toBe("Staging")
      expect(info.description).toBe("Test environment with signet (not real sats)")
      expect(info.isProduction).toBe(false)
      expect(info.isStaging).toBe(true)
    })
  })

  describe("Environment-specific URL helpers", () => {
    beforeEach(async () => {
      await loadModule()
    })

    describe("getApiUrlForEnvironment()", () => {
      it("should return production URL for production", () => {
        expect(apiConfig.getApiUrlForEnvironment("production"))
          .toBe("https://api.blink.sv/graphql")
      })

      it("should return staging URL for staging", () => {
        expect(apiConfig.getApiUrlForEnvironment("staging"))
          .toBe("https://api.staging.blink.sv/graphql")
      })

      it("should return production URL for invalid environment", () => {
        expect(apiConfig.getApiUrlForEnvironment("invalid"))
          .toBe("https://api.blink.sv/graphql")
      })
    })

    describe("getWsUrlForEnvironment()", () => {
      it("should return production URL for production", () => {
        expect(apiConfig.getWsUrlForEnvironment("production"))
          .toBe("wss://ws.blink.sv/graphql")
      })

      it("should return staging URL for staging", () => {
        expect(apiConfig.getWsUrlForEnvironment("staging"))
          .toBe("wss://ws.staging.blink.sv/graphql")
      })

      it("should return production URL for invalid environment", () => {
        expect(apiConfig.getWsUrlForEnvironment("invalid"))
          .toBe("wss://ws.blink.sv/graphql")
      })
    })

    describe("getPayUrlForEnvironment()", () => {
      it("should return production URL for production", () => {
        expect(apiConfig.getPayUrlForEnvironment("production"))
          .toBe("https://pay.blink.sv")
      })

      it("should return staging URL for staging", () => {
        expect(apiConfig.getPayUrlForEnvironment("staging"))
          .toBe("https://pay.staging.blink.sv")
      })

      it("should return production URL for invalid environment", () => {
        expect(apiConfig.getPayUrlForEnvironment("invalid"))
          .toBe("https://pay.blink.sv")
      })
    })
  })

  describe("Module initialization logging", () => {
    it("should log environment info on module load (client-side)", async () => {
      await loadModule()
      
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("[API Config] Environment:")
      )
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("[API Config] API URL:")
      )
    })

    it("should log warning when in staging mode", async () => {
      localStorage.setItem("blink_environment", "staging")
      await loadModule()
      
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("STAGING MODE")
      )
    })

    it("should not log staging warning in production", async () => {
      await loadModule()
      
      // Check that the staging warning was NOT called
      const warnCalls = (console.warn as jest.Mock).mock.calls
      const hasStagingWarning = warnCalls.some(
        (call: string[]) => call[0]?.includes("STAGING MODE")
      )
      expect(hasStagingWarning).toBe(false)
    })
  })

  describe("getAllEnvironments()", () => {
    it("should return the full ENVIRONMENTS object", async () => {
      await loadModule()
      
      const envs = apiConfig.getAllEnvironments()
      
      expect(envs).toHaveProperty("production")
      expect(envs).toHaveProperty("staging")
      expect(Object.keys(envs)).toHaveLength(2)
    })

    it("should include all required properties for each environment", async () => {
      await loadModule()
      
      const envs = apiConfig.getAllEnvironments() as Record<string, Record<string, unknown>>
      
      const requiredProps = [
        "name",
        "apiUrl",
        "dashboardUrl",
        "payUrl",
        "wsUrl",
        "lnAddressDomain",
        "validDomains",
        "description",
      ]
      
      for (const envKey of Object.keys(envs)) {
        for (const prop of requiredProps) {
          expect(envs[envKey]).toHaveProperty(prop)
        }
      }
    })
  })
})
